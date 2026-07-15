"""Geocoding (Naver Maps + Nominatim/OSM) and walking route generation (TMAP/Valhalla).

경로 엔진 (우선순위 순):
  1. TMAP 보행자 경로 API (apis.openapi.sk.com) — 앱키(TMAP_APP_KEY) 설정 시
     - 국내 보행자 도로/횡단보도/지하철 출구 기반, 한국 지역 정확도 우수
     - 앱키는 환경변수 TMAP_APP_KEY 또는 Streamlit secrets의 TMAP_APP_KEY로 주입
  2. Valhalla public API (valhalla1.openstreetmap.de) — pedestrian costing
     - 앱키 미설정 또는 TMAP 호출 실패 시 자동 대체
주소/역 검색: Naver Geocoding(주소 전용) → TMAP 장소검색(POI) → Nominatim 폴백
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


# 도보 소요시간 추정 기준(사용자 지정): 시속 4km(분당 약 67m) — 신호대기·횡단보도·
# 길찾기 지연까지 반영한 실사용 기준(3.5~4km/h)의 안전값. API(TMAP/Valhalla)가
# 시간을 주면 그 값을 우선하고, 없을 때만 이 기준으로 추정해 표시가 비지 않게 한다.
WALKING_SPEED_KMH = 4.0


def estimate_walking_seconds(distance_meters: int | float | None) -> int | None:
    """거리(m) → 도보 소요초(시속 4km 기준). 거리가 없으면 None."""
    if not distance_meters or distance_meters <= 0:
        return None
    return int(round(float(distance_meters) / (WALKING_SPEED_KMH * 1000.0 / 3600.0)))


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
_TMAP_POI = "https://apis.openapi.sk.com/tmap/pois"  # 장소명(POI) 통합검색
_TMAP_REVERSE = "https://apis.openapi.sk.com/tmap/geo/reversegeocoding"  # 좌표→주소
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

# 주소단위(도로명 로/길/대로, 지번 동/가) + 건물번호/지번이 공백 없이 붙은 검색어 감지 —
# 예 '서판로30', '만수동123', '테헤란로4길15', '종로1가15', '목1동327'.
# Naver 지오코딩은 주소단위와 번호 사이 공백을 요구해 붙여 쓰면 addresses 가 비어
# 결과가 안 뜬다. 주소단위 토큰은 한글로 시작하고 중간에 숫자를 품을 수 있어(번길 '로4길',
# 가 '1가', 행정동 '1동') 그 뒤 '끝자리 번호'만 떼어낸다. 번호 뒤에 한글·숫자가 이어지면
# 매칭에서 제외돼 다음은 그대로 유지된다:
#   · '서판로30번길'(번호 뒤 번길 = 도로명 자체), '테헤란로152번길'
#   · '래미안103동1502호'(동 뒤 번호에 호가 붙음 = 아파트 동/호), '강남역10번출구'(역·번)
#   · '만수3동'·'성수동2가'(끝에 붙은 번호 없음)
# 한계: '상가123'·'운동123'처럼 주소가 아닌 일반어도 구조가 같아 '상가 123'으로 쪼개지나,
# 변형은 '원본이 결과 0일 때만' 시도하는 폴백이라 무해하다(비주소는 변형도 결과 0).
_ROAD_NUM_RE = re.compile(
    r"([가-힣A-Za-z][가-힣A-Za-z0-9]*(?:대로|로|길|동|가))(\d[\d\-]*)(?![가-힣\d])")


def _road_number_variants(query: str) -> list[str]:
    """'서판로30'·'만수동123'처럼 주소단위·번호가 붙은 검색어를 공백 변형으로도 확장.

    원본을 항상 먼저 넣어 '서판로30번길'·'만수3동'·'래미안103동1502호' 같은 표기는 그대로
    해석되게 하고, 공백을 끼운 변형('서판로 30'·'만수동 123'·'테헤란로4길 15')을 뒤에 덧붙여
    Naver 지오코딩(도로명·지번 주소)의 검색 성공률을 높인다. 바꿀 게 없으면 원본만 반환."""
    q = (query or "").strip()
    variants = [q]
    spaced = _ROAD_NUM_RE.sub(r"\1 \2", q)
    if spaced != q:
        variants.append(spaced)
    return variants


def _naver_geocode(query: str) -> tuple[Coordinate, str] | None:
    """Naver Maps Geocoding(주소 전용). 키 없음·POI·오류 시 None → Nominatim 폴백.

    '서판로30'처럼 도로명·건물번호가 붙은 검색어는 공백을 끼운 변형('서판로 30')도
    순서대로 시도한다 — Naver 는 공백 없는 도로명 주소를 못 찾아 결과가 비기 때문이다.
    """
    headers = _naver_headers()
    if headers is None:
        return None
    for q in _road_number_variants(query):
        try:
            resp = requests.get(
                _NAVER_GEOCODE, params={"query": q}, headers=headers, timeout=_TIMEOUT,
            )
            if resp.status_code != 200:
                continue
            hits = resp.json().get("addresses", [])
            if not hits:
                continue
            hit = hits[0]
            display = hit.get("roadAddress") or hit.get("jibunAddress") or q
            return (
                Coordinate(latitude=float(hit["y"]), longitude=float(hit["x"])),
                display,
            )
        except (requests.RequestException, KeyError, ValueError):
            continue
    return None


def _tmap_poi_results(query: str, limit: int = 5,
                      center: Coordinate | None = None) -> list[tuple[Coordinate, str]]:
    """TMAP 장소(POI) 통합검색 — '경복궁'처럼 주소가 아닌 장소명을 좌표로 변환.

    Naver 지오코딩은 주소 전용이라 장소명 검색이 비는데, 그 빈틈을 국내 POI DB로
    메운다. 앱키 없음·오류·결과 없음이면 빈 리스트(다음 폴백으로 넘어감).
    좌표는 입구(frontLat/Lon)를 우선하고 0이거나 없으면 중심점(noorLat/Lon)을 쓴다.
    center 를 주면 그 좌표 기준 '거리순'으로 검색한다(searchtypCd=R) — 전국 인기순
    상위 N개만 받아 그중에서 정렬하던 한계(가까운 지점이 후보에 아예 못 듦)를 제거.
    """
    app_key = _tmap_app_key()
    if not app_key:
        return []
    params = {"version": "1", "searchKeyword": query, "count": limit,
              "reqCoordType": "WGS84GEO", "resCoordType": "WGS84GEO"}
    if center is not None:
        params.update({"centerLat": f"{center.latitude:.8f}",
                       "centerLon": f"{center.longitude:.8f}",
                       "searchtypCd": "R"})
    try:
        resp = requests.get(
            _TMAP_POI,
            params=params,
            headers={"appKey": app_key, "Accept": "application/json"},
            timeout=_TIMEOUT,
        )
        if resp.status_code != 200:
            return []
        pois = resp.json().get("searchPoiInfo", {}).get("pois", {}).get("poi", []) or []
    except (requests.RequestException, KeyError, ValueError):
        return []
    out: list[tuple[Coordinate, str]] = []
    for p in pois[:limit]:
        coord = None
        for lat_key, lon_key in (("frontLat", "frontLon"), ("noorLat", "noorLon")):
            try:
                lat, lon = float(p.get(lat_key) or 0), float(p.get(lon_key) or 0)
            except (TypeError, ValueError):
                continue
            if lat and lon:
                coord = Coordinate(latitude=lat, longitude=lon)
                break
        if coord is None:
            continue
        name = (p.get("name") or "").strip()
        addr = " ".join(
            s.strip() for s in (p.get("upperAddrName"), p.get("middleAddrName"),
                                p.get("lowerAddrName"), p.get("detailAddrName"))
            if s and s.strip()
        )
        # 한국식 표기: 주소(광역→세부) 뒤에 장소명. 예) '서울 종로구 세종로 경복궁'
        display = f"{addr} {name}" if name and addr else (name or addr or query)
        out.append((coord, display))
    return out


def geocode_address(query: str) -> tuple[Coordinate, str] | None:
    """주소/장소명 → (Coordinate, 표시 주소).

    Naver Maps 지오코딩(정확한 도로명/지번 주소) → TMAP 장소(POI) 검색 →
    Nominatim 변형 검색 순으로 폴백합니다(키 없는 소스는 자동으로 건너뜀).
    """
    naver = _naver_geocode(query)
    if naver is not None:
        return naver
    pois = _tmap_poi_results(query, limit=1)
    if pois:
        return pois[0]
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


def geocode_suggestions(query: str, limit: int = 5,
                        center: Coordinate | None = None) -> list[tuple[Coordinate, str]]:
    """검색어로 후보 장소 목록을 반환(경로 탐색 전 미리보기/자동완성용).

    Naver(주소 전용) → TMAP 장소(POI) → Nominatim 변형 검색 순으로 보충.
    키 없음·네트워크 오류·결과 없음이면 빈 리스트(예외를 호출부로 전파하지 않음).
    center(현재 위치)를 주면 TMAP POI 를 그 좌표 기준 거리순으로 가져온다.
    """
    q = (query or "").strip()
    if not q:
        return []
    out: list[tuple[Coordinate, str]] = []
    seen: set[tuple[float, float]] = set()
    seen_labels: set[str] = set()

    def _add(lat: float, lon: float, display: str) -> None:
        key = (round(lat, 6), round(lon, 6))
        if key in seen:
            return
        # 화면에 보이는 라벨이 이미 담긴 후보와 '글자까지 동일'하면 건너뛴다.
        # (같은 도로·POI 가 좌표만 살짝 달라 여러 줄로 뜨던 '똑같아 보이는 주소' 제거 —
        #  사용자가 무엇을 고를지 구분 못 하는 문제. 거리 표시는 UI 에서 붙으므로 여기선
        #  거리 이전의 주소 라벨 기준으로 판단한다. 건물번호가 다르면 라벨이 달라 유지된다.)
        label = format_place_label(display)
        if label and label in seen_labels:
            return
        seen.add(key)
        if label:
            seen_labels.add(label)
        out.append((Coordinate(latitude=lat, longitude=lon), display))

    # 1) Naver addresses 배열(여러 후보)
    #    '서판로30'처럼 도로명·건물번호가 붙은 검색어는 공백 변형('서판로 30')도 시도.
    #    원본이 후보를 채우면 변형은 건너뛴다(불필요한 호출·근접 중복 방지).
    headers = _naver_headers()
    if headers is not None:
        for q_variant in _road_number_variants(q):
            try:
                resp = requests.get(
                    _NAVER_GEOCODE, params={"query": q_variant, "count": limit},
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
            if out:
                break

    # 2) Naver(주소 전용) 결과가 없으면 TMAP 장소(POI) 검색으로 보충 —
    #    '경복궁' 같은 장소명은 여기서 잡힌다 (키 없으면 빈 리스트로 통과)
    if not out:
        for coord, display in _tmap_poi_results(q, limit, center=center):
            _add(coord.latitude, coord.longitude, display)

    # 3) 둘 다 없을 때만 Nominatim 변형 검색으로 폴백
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


def _tmap_reverse(coord: Coordinate) -> str | None:
    """TMAP Reverse Geocoding(좌표→주소). 앱키 없음·오류 시 None → 다음 폴백."""
    app_key = _tmap_app_key()
    if not app_key:
        return None
    try:
        resp = requests.get(
            _TMAP_REVERSE,
            params={"version": "1", "lat": f"{coord.latitude:.8f}",
                    "lon": f"{coord.longitude:.8f}",
                    "coordType": "WGS84GEO", "addressType": "A10"},
            headers={"appKey": app_key, "Accept": "application/json"},
            timeout=_TIMEOUT,
        )
        if resp.status_code != 200:
            return None
        info = resp.json().get("addressInfo", {})
        # addressType=A10 의 fullAddress 는 행정동·지번·도로명 주소를 공백으로 이어붙여
        # "…합정동 …합정동 355-1 …어울마당로3길 19 …" 처럼 읽기 불가능하다(실기기 보고).
        # 구조 필드로 도로명(없으면 지번) 주소 '하나만' 조립하고, 실패 시에만 fullAddress.
        road = " ".join(p for p in (info.get("city_do"), info.get("gu_gun"),
                                    info.get("roadName"), info.get("buildingIndex")) if p)
        if road and info.get("buildingName"):
            road = f"{road} {info['buildingName']}"
        jibun = " ".join(p for p in (info.get("city_do"), info.get("gu_gun"),
                                     info.get("legalDong"), info.get("bunji")) if p)
        full = (road or jibun or info.get("fullAddress") or "").strip()
        return full or None
    except (requests.RequestException, KeyError, ValueError):
        return None


def reverse_geocode(coord: Coordinate) -> str | None:
    """좌표 → 한국어 주소 문자열 (Naver → TMAP → Nominatim 순 폴백)."""
    naver = _naver_reverse(coord)
    if naver is not None:
        return naver
    tmap = _tmap_reverse(coord)
    if tmap is not None:
        return tmap
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


# 주소 표시에서 숨기는 국가명 / 후보 라벨에서만 생략하는 광역시도.
_COUNTRY_TOKENS = frozenset({"대한민국", "South Korea"})
_METRO_TOKENS = frozenset({
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시",
    "대전광역시", "울산광역시", "세종특별자치시",
    "경기도", "강원도", "강원특별자치도", "충청북도", "충청남도",
    "전라북도", "전북특별자치도", "전라남도", "경상북도", "경상남도",
    "제주특별자치도", "제주도",
})
_LABEL_DROP_TOKENS = _COUNTRY_TOKENS | _METRO_TOKENS  # 하위호환(외부 참조용)
_POSTCODE_RE = re.compile(r"^\d{5}$")
# 공백형 주소의 국가명 제거 — 단어 경계로만 지운다. 부분문자열로 지우면
# '대한민국역사박물관' 같은 실존 장소명이 '역사박물관'으로 잘린다.
_COUNTRY_RE = re.compile(r"(?:^|\s)(?:대한민국|South Korea)(?=\s|$)")


def _address_tokens(display: str) -> tuple[list[str], str]:
    """주소 문자열 → (광역→세부 순 토큰, 우편번호).

    쉼표형(Nominatim display_name)은 '장소, 도로, 동, 구, 광역시도, 우편번호, 대한민국'
    처럼 **세부→광역 역순**이라 한국식(광역→세부)으로 뒤집는다. 역순 판별은 마지막
    토큰이 국가명인지로 하는데, 쉼표형은 Nominatim 전용이고 Nominatim 은 국가명을
    항상 붙이므로 성립한다(다른 쉼표형 소스를 추가하면 이 전제를 재검토할 것).

    Naver·TMAP 공백형 주소는 이미 한국식 순서라 뒤집지 않고, **우편번호도 없다** —
    그래서 공백형에선 우편번호를 추출하지 않는다(5자리 번지를 우편번호로 오인 방지).
    """
    s = display.strip()
    if "," in s:
        toks = [t.strip() for t in s.split(",") if t.strip()]
        reverse = bool(toks) and toks[-1] in _COUNTRY_TOKENS
        postcode = next((t for t in toks if _POSTCODE_RE.fullmatch(t)), "")
        body = [t for t in toks
                if t not in _COUNTRY_TOKENS and not _POSTCODE_RE.fullmatch(t)]
    else:
        toks = _COUNTRY_RE.sub(" ", s).split()
        reverse = False
        postcode = ""  # 공백형엔 우편번호가 없다
        body = [t for t in toks if t not in _COUNTRY_TOKENS]
    if reverse:
        body.reverse()
    return body, postcode


def format_korean_address(display: str | None) -> str:
    """전체 주소를 한국식 표기로 정규화한다.

    예) '맥도날드, 백범로227번길, 만수5동, 남동구, 인천광역시, 21518, 대한민국'
      → '(21518) 인천광역시 남동구 만수5동 백범로227번길 맥도날드'

    우편번호는 지우지 않고 맨 앞 괄호로 옮기고, 국가명은 숨기며, Nominatim 역순은
    광역→세부로 뒤집는다. None/빈 문자열은 빈 문자열.
    """
    if not display or not display.strip():
        return ""
    body, postcode = _address_tokens(display)
    core = " ".join(body)
    if not core:
        return f"({postcode})" if postcode else ""
    return f"({postcode}) {core}" if postcode else core


def format_place_label(display: str | None) -> str:
    """검색 후보 라벨 — 한국식 순서(광역→세부)로, 국가·광역시도·우편번호는 뺀다.

    광역시도를 빼 라벨을 짧게 유지하되 구·동·도로·번지 상세는 남겨 동명 후보를
    구분할 수 있게 한다. None/빈 문자열은 빈 문자열.
    """
    if not display or not display.strip():
        return ""
    body, _ = _address_tokens(display)
    toks = [t for t in body if t not in _METRO_TOKENS]
    return " ".join(toks or body)


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
        total_time_seconds=(total_time if total_time is not None
                            else estimate_walking_seconds(total_distance)),
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
    dist_m = int(summary["length"] * 1000) if "length" in summary else None
    info = RouteInfo(
        total_distance_meters=dist_m,
        total_time_seconds=(int(summary["time"]) if "time" in summary
                            else estimate_walking_seconds(dist_m)),
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
