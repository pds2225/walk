"""Geocoding (Nominatim/OSM) and walking route generation (TMAP/Valhalla) for navigation mode.

경로 엔진 (우선순위 순):
  1. TMAP 보행자 경로 API (apis.openapi.sk.com) — 앱키(TMAP_APP_KEY) 설정 시
     - 국내 보행자 도로/횡단보도/지하철 출구 기반, 한국 지역 정확도 우수
     - 앱키는 환경변수 TMAP_APP_KEY 또는 Streamlit secrets의 TMAP_APP_KEY로 주입
  2. Valhalla public API (valhalla1.openstreetmap.de) — pedestrian costing
     - 앱키 미설정 또는 TMAP 호출 실패 시 자동 대체
주소/역 검색: Nominatim (nominatim.openstreetmap.org) — 무료·무키
역 출구 처리: "강남역 10번출구" 등 N가지 표기 변형을 순서대로 시도
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from urllib.parse import quote

import requests

sys.path.insert(0, str(Path(__file__).parent))
from engine import Coordinate, RouteModel, TurnPoint

_NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
_NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse"
_VALHALLA = "https://valhalla1.openstreetmap.de/route"
_TMAP_PEDESTRIAN = "https://apis.openapi.sk.com/tmap/routes/pedestrian"
_UA = "walk-navi-mvp/1.0"
_TIMEOUT = 15
_HEADERS_KO = {"User-Agent": _UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"}
_GEOCODE_COUNTRY = "kr"  # Nominatim countrycodes — 동명 해외 지명 오선택 방지


# ── 지하철 출구 query 전처리 ─────────────────────────────────────────────────

def _subway_candidates(query: str) -> list[str]:
    """'강남역 10번출구' 표기를 여러 형태로 확장해 Nominatim 검색 성공률을 높입니다."""
    m = re.search(r"(.+?역)\s*(\d+)\s*번?\s*출구", query)
    if not m:
        return [query]
    station, num = m.group(1).strip(), m.group(2)
    return list(dict.fromkeys([
        query,
        f"{station} {num}번출구",
        f"{station} {num}번 출구",
        f"{station} {num}호출구",
        f"{station} {num}호 출구",
        f"{station} exit {num}",
        f"{station} {num}",
        station,
    ]))


# ── geocoding ────────────────────────────────────────────────────────────────

def geocode_address(query: str) -> tuple[Coordinate, str] | None:
    """주소/장소명 → (Coordinate, 표시 주소).

    지하철 출구 표기 변형을 순서대로 시도하고, 성공 시 display_name을 함께 반환합니다.
    """
    for candidate in _subway_candidates(query):
        resp = requests.get(
            _NOMINATIM_SEARCH,
            params={"q": candidate, "format": "json", "limit": 1, "countrycodes": _GEOCODE_COUNTRY},
            headers=_HEADERS_KO,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        hits = resp.json()
        if hits:
            return (
                Coordinate(latitude=float(hits[0]["lat"]), longitude=float(hits[0]["lon"])),
                hits[0].get("display_name", candidate),
            )
    return None


# ── reverse geocoding ─────────────────────────────────────────────────────────

def reverse_geocode(coord: Coordinate) -> str | None:
    """좌표 → 한국어 주소 문자열 (Nominatim reverse geocoding)."""
    resp = requests.get(
        _NOMINATIM_REVERSE,
        params={"lat": coord.latitude, "lon": coord.longitude, "format": "json"},
        headers=_HEADERS_KO,
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        return None
    return data.get("display_name")


# ── Valhalla polyline6 디코더 ─────────────────────────────────────────────────

def _decode_polyline6(encoded: str) -> list[Coordinate]:
    """Valhalla polyline6 인코딩 문자열을 Coordinate 리스트로 디코딩합니다."""
    coords: list[Coordinate] = []
    index = 0
    lat = 0
    lon = 0
    n = len(encoded)

    while index < n:
        for is_lon in (False, True):
            shift, value = 0, 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                value |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(value >> 1) if (value & 1) else (value >> 1)
            if is_lon:
                lon += delta
                coords.append(Coordinate(latitude=lat * 1e-6, longitude=lon * 1e-6))
            else:
                lat += delta

    return coords


# ── TMAP 앱키 ────────────────────────────────────────────────────────────────

def _tmap_app_key() -> str | None:
    """TMAP 앱키를 환경변수 → Streamlit secrets 순으로 찾습니다. 없으면 None."""
    key = os.environ.get("TMAP_APP_KEY", "").strip()
    if key:
        return key
    try:
        import streamlit as st
        return str(st.secrets["TMAP_APP_KEY"]).strip() or None
    except Exception:
        return None


# ── 경로 탐색 (TMAP pedestrian) ──────────────────────────────────────────────

_TMAP_TURN_LEFT  = {12, 16, 17}  # 좌회전 / 8시 방향 좌회전 / 10시 방향 좌회전
_TMAP_TURN_RIGHT = {13, 18, 19}  # 우회전 / 2시 방향 우회전 / 4시 방향 우회전


def _route_from_tmap_features(features: list[dict]) -> RouteModel:
    """TMAP 보행자 경로 응답(GeoJSON features)을 RouteModel로 변환합니다.

    - LineString 좌표([lon, lat])를 이어붙여 polyline 구성 (구간 경계 중복 좌표 제거)
    - Point의 turnType이 좌/우회전이면 회전 지점으로 수집
      (Point 좌표 = 직전 LineString의 마지막 좌표이므로 그 시점의 polyline 끝 인덱스 사용)
    """
    coords: list[Coordinate] = []
    raw_turns: list[tuple[int, str]] = []  # (route_index, direction)

    for feature in features:
        geometry = feature.get("geometry", {})
        gtype = geometry.get("type")
        if gtype == "Point":
            turn_type = feature.get("properties", {}).get("turnType")
            if turn_type in _TMAP_TURN_LEFT or turn_type in _TMAP_TURN_RIGHT:
                direction = "left" if turn_type in _TMAP_TURN_LEFT else "right"
                raw_turns.append((len(coords) - 1, direction))
        elif gtype == "LineString":
            for lon, lat in geometry.get("coordinates", []):
                c = Coordinate(latitude=float(lat), longitude=float(lon))
                if coords and coords[-1] == c:
                    continue
                coords.append(c)

    if len(coords) < 2:
        raise ValueError("TMAP 경로 좌표가 너무 적습니다.")

    turn_points: list[TurnPoint] = []
    seen: set[int] = set()
    tid = 0
    for idx, direction in raw_turns:
        if idx in seen or idx <= 0 or idx >= len(coords) - 1:
            continue
        seen.add(idx)
        tid += 1
        turn_points.append(TurnPoint(
            id=f"turn-{tid}",
            coordinate=coords[idx],
            route_index=idx,
            direction=direction,
        ))

    return RouteModel(polyline=tuple(coords), turn_points=tuple(turn_points))


def _fetch_walking_route_tmap(origin: Coordinate, dest: Coordinate, app_key: str) -> RouteModel:
    """TMAP 보행자 경로 API(POST /tmap/routes/pedestrian)로 도보 경로를 가져옵니다."""
    resp = requests.post(
        _TMAP_PEDESTRIAN,
        params={"version": "1"},
        headers={"appKey": app_key, "Content-Type": "application/json", "Accept": "application/json"},
        json={
            "startX": f"{origin.longitude:.8f}",
            "startY": f"{origin.latitude:.8f}",
            "endX": f"{dest.longitude:.8f}",
            "endY": f"{dest.latitude:.8f}",
            "startName": quote("출발", safe=""),  # URL인코딩(UTF-8) 필수 파라미터
            "endName": quote("도착", safe=""),
            "reqCoordType": "WGS84GEO",
            "resCoordType": "WGS84GEO",
            "searchOption": "0",  # 0=추천 경로
        },
        timeout=_TIMEOUT,
    )
    if resp.status_code != 200:
        try:
            err = resp.json().get("error", {})
            detail = f"{err.get('code', resp.status_code)} {err.get('message', '')}".strip()
        except ValueError:
            detail = str(resp.status_code)
        raise ValueError(f"TMAP 경로 탐색 실패: {detail}")
    return _route_from_tmap_features(resp.json().get("features", []))


# ── 경로 탐색 (Valhalla pedestrian) ──────────────────────────────────────────

_TURN_RIGHT = {4, 5, 6}   # slight_right / right / sharp_right
_TURN_LEFT  = {8, 9, 10}  # sharp_left  / left  / slight_left


def _fetch_walking_route_valhalla(origin: Coordinate, dest: Coordinate) -> RouteModel:
    """Valhalla pedestrian costing으로 도보 경로를 가져와 RouteModel로 변환합니다."""
    resp = requests.post(
        _VALHALLA,
        json={
            "locations": [
                {"lon": origin.longitude, "lat": origin.latitude},
                {"lon": dest.longitude,   "lat": dest.latitude},
            ],
            "costing": "pedestrian",
            "directions_options": {"units": "km"},
        },
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()

    if "trip" not in data:
        raise ValueError(f"경로를 찾지 못했습니다: {data.get('status_message', '알 수 없음')}")

    leg = data["trip"]["legs"][0]
    polyline = _decode_polyline6(leg["shape"])

    if len(polyline) < 2:
        raise ValueError("경로 좌표가 너무 적습니다.")

    turn_points: list[TurnPoint] = []
    seen: set[int] = set()
    tid = 0

    for maneuver in leg.get("maneuvers", []):
        mtype = maneuver.get("type", 0)
        if mtype not in (_TURN_RIGHT | _TURN_LEFT):
            continue
        idx = maneuver.get("begin_shape_index", 0)
        if idx in seen or idx <= 0 or idx >= len(polyline) - 1:
            continue
        seen.add(idx)
        direction = "right" if mtype in _TURN_RIGHT else "left"
        tid += 1
        turn_points.append(TurnPoint(
            id=f"turn-{tid}",
            coordinate=polyline[idx],
            route_index=idx,
            direction=direction,
        ))

    return RouteModel(polyline=tuple(polyline), turn_points=tuple(turn_points))


# ── 경로 탐색 진입점 (TMAP 우선, Valhalla 대체) ──────────────────────────────

_last_engine_used: str | None = None   # "tmap" | "valhalla" — 마지막 경로 탐색에 쓰인 엔진
_last_tmap_error: str | None = None    # TMAP 실패 → Valhalla 대체 시 원인 (UI 표시용)


def fetch_walking_route(origin: Coordinate, dest: Coordinate) -> RouteModel:
    """도보 경로를 가져옵니다. TMAP 앱키가 있으면 TMAP, 없거나 실패하면 Valhalla.

    Returns:
        RouteModel — polyline(전체 좌표) + turn_points(회전 지점)
    Raises:
        ValueError: 경로를 찾지 못한 경우.
        requests.RequestException: 네트워크 오류.
    """
    global _last_engine_used, _last_tmap_error
    app_key = _tmap_app_key()
    if app_key:
        try:
            route = _fetch_walking_route_tmap(origin, dest, app_key)
            _last_engine_used, _last_tmap_error = "tmap", None
            return route
        except Exception as exc:  # TMAP 한도 초과/경로 없음 등 — Valhalla로 자동 대체
            _last_tmap_error = str(exc)
    route = _fetch_walking_route_valhalla(origin, dest)
    _last_engine_used = "valhalla"
    return route


def route_engine_label() -> str:
    """UI 표시용 현재 경로 엔진 설명 문자열."""
    if _last_engine_used == "tmap":
        return "TMAP 보행자 경로 (SK open API)"
    if _last_engine_used == "valhalla":
        if _last_tmap_error:
            return f"Valhalla (TMAP 호출 실패로 대체 — {_last_tmap_error})"
        return "Valhalla (OpenStreetMap 도보 전용)"
    if _tmap_app_key():
        return "TMAP 보행자 경로 (SK open API)"
    return "Valhalla (OpenStreetMap 도보 전용) — TMAP 앱키 미설정"
