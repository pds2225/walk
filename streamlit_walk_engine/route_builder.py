"""Geocoding (Naver Maps + Nominatim/OSM) and walking route generation (Valhalla).

경로 엔진: Valhalla public API (valhalla1.openstreetmap.de) — pedestrian costing
  - OSM 보행자 전용 도로/인도 기반
  - 속도 기준 약 1.4 m/s (도보), 차도 미사용
주소/역 검색: Naver Maps Geocoding(주소 전용, 키 필요) 우선 → Nominatim 폴백
  - 키는 환경변수 NAVER_MAPS_CLIENT_ID/SECRET 또는 마스터 .env(D:\\_secure\\.env.shared)
  - 키가 없거나 호출 실패 시 기존 Nominatim 동작 그대로 유지
역 출구 처리: "강남역 10번출구" 등 N가지 표기 변형을 순서대로 시도 (Nominatim)
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from engine import Coordinate, RouteModel, TurnPoint

_NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
_NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse"
_VALHALLA = "https://valhalla1.openstreetmap.de/route"
_UA = "walk-navi-mvp/1.0"
_TIMEOUT = 15
_HEADERS_KO = {"User-Agent": _UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"}
_GEOCODE_COUNTRY = "kr"  # Nominatim countrycodes — 동명 해외 지명 오선택 방지

_NAVER_GEOCODE = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode"
_NAVER_REVERSE = "https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc"
_ENV_SHARED = Path(r"D:\_secure\.env.shared")  # 마스터 .env — 키를 코드에 넣지 않음
_naver_keys_cache: dict[str, str] | None | bool = False  # False=미로드, None=키 없음


def _naver_headers() -> dict[str, str] | None:
    """NCP 인증 헤더. 환경변수 우선, 없으면 마스터 .env에서 로드(1회 캐시)."""
    global _naver_keys_cache
    if _naver_keys_cache is False:
        cid = os.environ.get("NAVER_MAPS_CLIENT_ID", "")
        sec = os.environ.get("NAVER_MAPS_CLIENT_SECRET", "")
        if not (cid and sec) and _ENV_SHARED.is_file():
            try:
                for line in _ENV_SHARED.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line.startswith("NAVER_MAPS_CLIENT_ID="):
                        cid = line.partition("=")[2].strip()
                    elif line.startswith("NAVER_MAPS_CLIENT_SECRET="):
                        sec = line.partition("=")[2].strip()
            except OSError:
                pass
        _naver_keys_cache = (
            {"X-NCP-APIGW-API-KEY-ID": cid, "X-NCP-APIGW-API-KEY": sec}
            if cid and sec else None
        )
    return _naver_keys_cache or None


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

def _naver_geocode(query: str) -> tuple[Coordinate, str] | None:
    """Naver Maps Geocoding(주소 전용). 키 없음·POI·오류 시 None → Nominatim 폴백."""
    headers = _naver_headers()
    if headers is None:
        return None
    try:
        resp = requests.get(
            _NAVER_GEOCODE, params={"query": query}, headers=headers, timeout=_TIMEOUT,
        )
        if resp.status_code != 200:
            return None
        hits = resp.json().get("addresses", [])
        if not hits:
            return None
        hit = hits[0]
        display = hit.get("roadAddress") or hit.get("jibunAddress") or query
        return (
            Coordinate(latitude=float(hit["y"]), longitude=float(hit["x"])),
            display,
        )
    except (requests.RequestException, KeyError, ValueError):
        return None


def geocode_address(query: str) -> tuple[Coordinate, str] | None:
    """주소/장소명 → (Coordinate, 표시 주소).

    Naver Maps 지오코딩(정확한 도로명/지번 주소)을 먼저 시도하고,
    역·출구·장소명 등 주소가 아닌 검색어는 기존 Nominatim 변형 검색으로 폴백합니다.
    """
    naver = _naver_geocode(query)
    if naver is not None:
        return naver
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

def _naver_reverse(coord: Coordinate) -> str | None:
    """Naver Maps Reverse Geocoding. 서비스 미활성(403)·키 없음·오류 시 None → 폴백."""
    headers = _naver_headers()
    if headers is None:
        return None
    try:
        resp = requests.get(
            _NAVER_REVERSE,
            params={
                "coords": f"{coord.longitude},{coord.latitude}",
                "output": "json",
                "orders": "roadaddr,addr",
            },
            headers=headers,
            timeout=_TIMEOUT,
        )
        if resp.status_code != 200:
            return None
        results = resp.json().get("results", [])
        if not results:
            return None
        r = results[0]
        region = r.get("region", {})
        parts = [region.get(f"area{i}", {}).get("name", "") for i in range(1, 5)]
        land = r.get("land") or {}
        road = land.get("name", "")
        num = land.get("number1", "")
        if land.get("number2"):
            num = f"{num}-{land['number2']}"
        parts += [road, num]
        address = " ".join(p for p in parts if p)
        return address or None
    except (requests.RequestException, KeyError, ValueError):
        return None


def reverse_geocode(coord: Coordinate) -> str | None:
    """좌표 → 한국어 주소 문자열 (Naver 우선, 실패 시 Nominatim 폴백)."""
    naver = _naver_reverse(coord)
    if naver is not None:
        return naver
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


# ── 경로 탐색 (Valhalla pedestrian) ──────────────────────────────────────────

_TURN_RIGHT = {4, 5, 6}   # slight_right / right / sharp_right
_TURN_LEFT  = {8, 9, 10}  # sharp_left  / left  / slight_left


def fetch_walking_route(origin: Coordinate, dest: Coordinate) -> RouteModel:
    """Valhalla pedestrian costing으로 도보 경로를 가져와 RouteModel로 변환합니다.

    Returns:
        RouteModel — polyline(전체 좌표) + turn_points(회전 지점)
    Raises:
        ValueError: 경로를 찾지 못한 경우.
        requests.RequestException: 네트워크 오류.
    """
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
