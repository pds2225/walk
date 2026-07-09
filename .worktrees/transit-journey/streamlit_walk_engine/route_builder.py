"""Geocoding (Naver Maps + Nominatim/OSM) and walking route generation (TMAP/Valhalla).

경로 엔진 (우선순위 순):
  1. TMAP 보행자 경로 API (apis.openapi.sk.com) — 앱키(TMAP_APP_KEY) 설정 시
     - 국내 보행자 도로/횡단보도/지하철 출구 기반, 한국 지역 정확도 우수
     - 앱키는 환경변수 TMAP_APP_KEY 또는 Streamlit secrets의 TMAP_APP_KEY로 주입
  2. Valhalla public API (valhalla1.openstreetmap.de) — pedestrian costing
     - 앱키 미설정 또는 TMAP 호출 실패 시 자동 대체
주소/역 검색: Naver Maps Geocoding(주소 전용, 키 필요) 우선 → Nominatim 폴백
  - 키는 환경변수 NAVER_MAPS_CLIENT_ID/SECRET 또는 마스터 .env(D:\\_secure\\.env.shared)
  - 키가 없거나 호출 실패 시 기존 Nominatim 동작 그대로 유지
역 출구 처리: "강남역 10번출구" 등 N가지 표기 변형을 순서대로 시도 (Nominatim)
"""

from __future__ import annotations

import math
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote

import requests

sys.path.insert(0, str(Path(__file__).parent))
from engine import Coordinate, RouteModel, TurnPoint, distance_meters


@dataclass(frozen=True)
class RouteInfo:
    """경로 부가정보 — RouteModel(엔진 입력)과 분리해 UI 표시에만 사용합니다."""
    total_distance_meters: int | None = None
    total_time_seconds: int | None = None
    turn_descriptions: dict[str, str] = field(default_factory=dict)  # TurnPoint.id → 안내문


_NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
_NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse"
_VALHALLA = "https://valhalla1.openstreetmap.de/route"
_TMAP_PEDESTRIAN = "https://apis.openapi.sk.com/tmap/routes/pedestrian"
_UA = "walk-navi-mvp/1.0"
_TIMEOUT = 8  # 응답은 보통 1~3초 — 상한을 줄여 실패 시 체감 대기 시간 단축
_HEADERS_KO = {"User-Agent": _UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"}
_GEOCODE_COUNTRY = "kr"  # Nominatim countrycodes — 동명 해외 지명 오선택 방지

_NAVER_GEOCODE = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode"
_NAVER_REVERSE = "https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc"
_ENV_SHARED = Path(r"D:\_secure\.env.shared")  # 마스터 .env — 키를 코드에 넣지 않음
_naver_keys_cache: dict[str, str] | None | bool = False  # False=미로드, None=키 없음


def _naver_headers() -> dict[str, str] | None:
    """NCP 인증 헤더. 환경변수 → Streamlit secrets → 마스터 .env 순으로 로드(1회 캐시).

    Streamlit Cloud에는 환경변수·마스터 .env가 없으므로 st.secrets 경로가 있어야
    Naver 지오코딩이 동작한다(없으면 Nominatim으로 폴백 — 클라우드 IP는 차단될 수 있음).
    """
    global _naver_keys_cache
    if _naver_keys_cache is False:
        cid = os.environ.get("NAVER_MAPS_CLIENT_ID", "")
        sec = os.environ.get("NAVER_MAPS_CLIENT_SECRET", "")
        if not (cid and sec):
            # Streamlit Cloud: Settings → Secrets 에 넣은 키 사용(로컬 .env 미존재 환경)
            try:
                import streamlit as st
                cid = cid or str(st.secrets.get("NAVER_MAPS_CLIENT_ID", "") or "")
                sec = sec or str(st.secrets.get("NAVER_MAPS_CLIENT_SECRET", "") or "")
            except Exception:
                pass
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


def geocode_suggestions(query: str, limit: int = 5) -> list[tuple[Coordinate, str]]:
    """검색어로 후보 장소 목록을 반환(경로 탐색 전 미리보기/자동완성용).

    Naver(주소 전용, addresses 배열) 우선 → 부족하면 Nominatim 변형 검색으로 보충.
    키 없음·네트워크 오류·결과 없음이면 빈 리스트(예외를 호출부로 전파하지 않음).
    """
    q = (query or "").strip()
    if not q:
        return []
    out: list[tuple[Coordinate, str]] = []
    seen: set[tuple[float, float]] = set()

    def _add(lat: float, lon: float, display: str) -> None:
        key = (round(lat, 6), round(lon, 6))
        if key in seen:
            return
        seen.add(key)
        out.append((Coordinate(latitude=lat, longitude=lon), display))

    # 1) Naver addresses 배열(여러 후보)
    headers = _naver_headers()
    if headers is not None:
        try:
            resp = requests.get(
                _NAVER_GEOCODE, params={"query": q, "count": limit},
                headers=headers, timeout=_TIMEOUT,
            )
            if resp.status_code == 200:
                for hit in resp.json().get("addresses", [])[:limit]:
                    try:
                        lat, lon = float(hit["y"]), float(hit["x"])
                    except (KeyError, ValueError, TypeError):
                        continue
                    _add(lat, lon, hit.get("roadAddress") or hit.get("jibunAddress") or q)
        except (requests.RequestException, KeyError, ValueError):
            pass

    # 2) Naver 결과가 전혀 없을 때만 Nominatim 변형 검색으로 폴백
    #    (혼합 출처의 근접 중복 후보 방지 + 결과 나오면 추가 변형 호출 생략으로 API 절약)
    if not out:
        for candidate in _subway_candidates(q):
            if len(out) >= limit:
                break
            try:
                resp = requests.get(
                    _NOMINATIM_SEARCH,
                    params={"q": candidate, "format": "json",
                            "limit": limit, "countrycodes": _GEOCODE_COUNTRY},
                    headers=_HEADERS_KO, timeout=_TIMEOUT,
                )
                if resp.status_code != 200:
                    continue
                hits = resp.json()
            except (requests.RequestException, KeyError, ValueError):
                continue
            for hit in hits:
                if len(out) >= limit:
                    break
                try:
                    lat, lon = float(hit["lat"]), float(hit["lon"])
                except (KeyError, ValueError, TypeError):
                    continue
                _add(lat, lon, hit.get("display_name", candidate))
            if out:
                break
    return out


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


# 쉼표로 둘러싸인 한국 5자리 우편번호(Nominatim display_name의 `, 06141,`)만 매칭.
_POSTCODE_COMMA_RE = re.compile(r",\s*\d{5}(?=\s*,)")


def strip_postcode(address: str | None) -> str | None:
    """주소에서 쉼표로 둘러싸인 한국 5자리 우편번호 세그먼트만 제거한다.

    Nominatim display_name 형식의 `..., 06141, 대한민국`처럼 쉼표 경계의 5자리만
    대상으로 한다(앞 쉼표·공백·5자리 제거, 뒤 쉼표는 lookahead로 보존). 공백형(Naver)
    주소는 우편번호를 포함하지 않으므로 건드리지 않고, 쉼표로 둘러싸이지 않은 5자리
    (건물번호 등)도 보존한다. None/빈 문자열은 그대로 반환(멱등).
    """
    if not address:
        return address
    return _POSTCODE_COMMA_RE.sub("", address)


# 검색 후보 라벨에서 빼는 군더더기 토큰: 국가·광역시도.
_LABEL_DROP_TOKENS = frozenset({
    "대한민국", "South Korea",
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시",
    "대전광역시", "울산광역시", "세종특별자치시",
    "경기도", "강원도", "강원특별자치도", "충청북도", "충청남도",
    "전라북도", "전북특별자치도", "전라남도", "경상북도", "경상남도",
    "제주특별자치도", "제주도",
})


def format_place_label(display: str | None) -> str:
    """검색 후보 표시 라벨을 정제한다 — 우편번호·국가·광역시도만 제거하고 나머지는 유지.

    동·구만 남기면 동명 후보가 똑같아 보여 구분이 안 되므로, 후보를 구분할 수 있게
    도로명·번지·동 등 상세를 보존한다. Nominatim 쉼표형은 국가·광역시도 토큰만 빼고
    나머지(도로·번지·동·구)를 그대로 잇고, Naver 공백형(도로명주소)은 앞쪽 광역시도
    접두만 떼어 'OO구 OO로 12' 형태로 남긴다. None/빈 문자열은 빈 문자열.
    """
    s = (strip_postcode(display) or "").strip()
    if not s:
        return ""
    if "," in s:  # Nominatim 쉼표형 — 국가·광역시도만 제거, 나머지(도로·번지·동·구) 유지
        toks = [t.strip() for t in s.split(",") if t.strip() and t.strip() not in _LABEL_DROP_TOKENS]
        return ", ".join(toks) if toks else s
    # Naver 공백형(도로명주소) — 앞쪽 광역시도 접두만 제거(번지까지 보존)
    for w in _LABEL_DROP_TOKENS:
        if s.startswith(w + " "):
            return s[len(w):].strip()
    return s


# ── 검색 후보: 현재 위치 기준 거리 표시·정렬 ──────────────────────────────────
# 동명(同名) 장소가 여러 곳일 때 현재 위치에서 가까운 후보를 위로 올리고 라벨에
# 거리를 붙여, 엉뚱한 곳을 고르는 오선택(위치 부정확)을 줄이고 어느 후보가 맞는지
# 직관적으로 구분하게 한다. 거리 계산은 엔진의 distance_meters(haversine)를 재사용.

def format_distance(meters: float) -> str:
    """사람이 읽는 거리 문자열. 995m 미만은 10m 단위 반올림한 'NNNm'(최소 10m),
    995m 이상은 소수 1자리 'N.Nkm'. 숫자가 아니거나 inf/nan이면 빈 문자열,
    음수는 0m로 취급(방어). 995~999m를 'NNNm' 대신 '1.0km'로 정돈한다."""
    try:
        m = float(meters)
    except (TypeError, ValueError):
        return ""
    if not math.isfinite(m):
        return ""
    if m < 0:
        m = 0.0
    if m < 995:
        rounded = int(round(m / 10.0)) * 10
        return f"{max(10, rounded)}m"
    return f"{m / 1000:.1f}km"


def label_with_distance(
    display: str | None,
    coord: Coordinate | None = None,
    origin: Coordinate | None = None,
) -> str:
    """검색 후보 라벨(format_place_label) 뒤에 현재 위치 기준 거리를 접미한다.

    origin/coord 중 하나라도 없으면 거리 없이 기존 라벨만 반환(기존 동작 보존).
    라벨이 비어 있으면 거리만 반환한다. 예: '테헤란로 152 · 250m'.
    """
    base = format_place_label(display)
    if origin is None or coord is None:
        return base
    dist = format_distance(distance_meters(origin, coord))
    if not dist:
        return base
    return f"{base} · {dist}" if base else dist


def sort_suggestions_by_distance(
    suggestions: list[tuple[Coordinate, str]],
    origin: Coordinate | None,
) -> list[tuple[Coordinate, str]]:
    """검색 후보를 origin(현재 위치) 기준 가까운 순으로 정렬한다.

    origin이 None이면 원래 순서를 그대로 유지한다(정렬하지 않음). 같은 거리는
    파이썬 안정 정렬로 입력 순서를 보존한다. 원본 리스트는 변형하지 않는다.
    """
    if origin is None:
        return list(suggestions)
    return sorted(suggestions, key=lambda item: distance_meters(origin, item[0]))


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


def _route_from_tmap_features(features: list[dict]) -> tuple[RouteModel, RouteInfo]:
    """TMAP 보행자 경로 응답(GeoJSON features)을 (RouteModel, RouteInfo)로 변환합니다.

    - LineString 좌표([lon, lat])를 이어붙여 polyline 구성 (구간 경계 중복 좌표 제거)
    - Point의 turnType이 좌/우회전이면 회전 지점으로 수집
      (Point 좌표 = 직전 LineString의 마지막 좌표이므로 그 시점의 polyline 끝 인덱스 사용)
    - 총거리/소요시간(첫 피처 properties)과 회전 지점별 한국어 안내문(description) 추출
    """
    coords: list[Coordinate] = []
    raw_turns: list[tuple[int, str, str]] = []  # (route_index, direction, 안내문)
    total_distance: int | None = None
    total_time: int | None = None

    for feature in features:
        geometry = feature.get("geometry", {})
        gtype = geometry.get("type")
        props = feature.get("properties", {})
        if total_distance is None and "totalDistance" in props:
            total_distance = int(props["totalDistance"])
        if total_time is None and "totalTime" in props:
            total_time = int(props["totalTime"])
        if gtype == "Point":
            turn_type = props.get("turnType")
            if turn_type in _TMAP_TURN_LEFT or turn_type in _TMAP_TURN_RIGHT:
                direction = "left" if turn_type in _TMAP_TURN_LEFT else "right"
                description = str(props.get("description", "")).strip()
                raw_turns.append((len(coords) - 1, direction, description))
        elif gtype == "LineString":
            for lon, lat in geometry.get("coordinates", []):
                c = Coordinate(latitude=float(lat), longitude=float(lon))
                if coords and coords[-1] == c:
                    continue
                coords.append(c)

    if len(coords) < 2:
        raise ValueError("TMAP 경로 좌표가 너무 적습니다.")

    turn_points: list[TurnPoint] = []
    turn_descriptions: dict[str, str] = {}
    seen: set[int] = set()
    tid = 0
    for idx, direction, description in raw_turns:
        if idx in seen or idx <= 0 or idx >= len(coords) - 1:
            continue
        seen.add(idx)
        tid += 1
        turn_id = f"turn-{tid}"
        turn_points.append(TurnPoint(
            id=turn_id,
            coordinate=coords[idx],
            route_index=idx,
            direction=direction,
        ))
        if description:
            turn_descriptions[turn_id] = description

    route = RouteModel(polyline=tuple(coords), turn_points=tuple(turn_points))
    info = RouteInfo(
        total_distance_meters=total_distance,
        total_time_seconds=total_time,
        turn_descriptions=turn_descriptions,
    )
    return route, info


def _fetch_walking_route_tmap(origin: Coordinate, dest: Coordinate, app_key: str) -> tuple[RouteModel, RouteInfo]:
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


def _fetch_walking_route_valhalla(origin: Coordinate, dest: Coordinate) -> tuple[RouteModel, RouteInfo]:
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

    summary = leg.get("summary", {})
    info = RouteInfo(
        total_distance_meters=int(summary["length"] * 1000) if "length" in summary else None,
        total_time_seconds=int(summary["time"]) if "time" in summary else None,
    )
    return RouteModel(polyline=tuple(polyline), turn_points=tuple(turn_points)), info


# ── 경로 탐색 진입점 (TMAP 우선, Valhalla 대체) ──────────────────────────────

_LABEL_TMAP = "TMAP 보행자 경로 (SK open API)"
_LABEL_VALHALLA = "Valhalla (OpenStreetMap 도보 전용)"


def fetch_walking_route_with_engine(origin: Coordinate, dest: Coordinate) -> tuple[RouteModel, str, RouteInfo]:
    """도보 경로를 가져옵니다. TMAP 앱키가 있으면 TMAP, 없거나 실패하면 Valhalla.

    Returns:
        (RouteModel, 사용한 엔진 설명, RouteInfo) — 호출자가 경로와 함께 세션별로
        보관해 캡션·총거리/ETA·회전 안내문이 항상 해당 경로를 가리키도록 합니다.
    Raises:
        ValueError: 경로를 찾지 못한 경우.
        requests.RequestException: 네트워크 오류.
    """
    tmap_error: str | None = None
    app_key = _tmap_app_key()
    if app_key:
        try:
            route, info = _fetch_walking_route_tmap(origin, dest, app_key)
            return route, _LABEL_TMAP, info
        except Exception as exc:  # TMAP 한도 초과/경로 없음 등 — Valhalla로 자동 대체
            tmap_error = str(exc)
    route, info = _fetch_walking_route_valhalla(origin, dest)
    if tmap_error:
        return route, f"Valhalla (TMAP 호출 실패로 대체 — {tmap_error})", info
    return route, _LABEL_VALHALLA, info


def fetch_walking_route(origin: Coordinate, dest: Coordinate) -> RouteModel:
    """fetch_walking_route_with_engine에서 경로만 반환하는 호환용 래퍼."""
    route, _, _ = fetch_walking_route_with_engine(origin, dest)
    return route


def route_engine_label() -> str:
    """경로 탐색 전 UI 표시용 — 앱키 유무에 따라 사용될 엔진 설명을 반환합니다."""
    if _tmap_app_key():
        return _LABEL_TMAP
    return f"{_LABEL_VALHALLA} — TMAP 앱키 미설정"
