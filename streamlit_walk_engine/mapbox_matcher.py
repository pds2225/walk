# -*- coding: utf-8 -*-
"""Mapbox Map Matching (스냅투루트) — 이탈 후보를 '실제 도로' 기준으로 확정/거부하는 선택 확인층.

왜 필요한가:
    도심 GPS는 20~30m씩 튀어 정상 보행 중에도 엔진이 '경로 이탈'로 오인 → 헛 재탐색.
    Mapbox Map Matching 은 최근 GPS 궤적을 실제 도로망에 스냅해 '지금 걷는 도로'를 알려준다.
    스냅된 위치가 계획 경로 위(코리도어 안)면 GPS 튐 → 재탐색을 막고(veto),
    스냅된 위치가 계획 경로에서 확실히 벗어나 있으면(옆 도로 등) → 진짜 이탈로 확정한다.

설계 원칙:
    · 비밀키(MAPBOX_TOKEN)는 env / st.secrets 에서만 읽는다 — 하드코딩·출력 절대 금지.
    · 키가 없으면 enabled()=False → 호출 자체를 안 한다. 내비 동작은 기존과 100% 동일(휴면).
    · 엔진이 이탈 후보(deviated/passed_turn)를 낼 때만 호출한다 → rate limit(분당 300)·비용 절약.
    · engine.py 코어는 건드리지 않는다(비침습). 순수 판정 로직(decide_from_match)과
      HTTP 호출(match_trace)을 분리해 네트워크 없이 단위 테스트가 가능하게 한다.

좌표 규약: 이 모듈의 모든 좌표는 Mapbox 규약을 따라 (lon, lat) 순서다.
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple
from urllib import error as _urlerror
from urllib import parse as _urlparse
from urllib import request as _urlrequest

Coord = Tuple[float, float]  # (lon, lat)

# ── 엔드포인트 ────────────────────────────────────────────────────────────────
_MATCH_URL = "https://api.mapbox.com/matching/v5/{profile}/{coords}"
_PROFILE = "mapbox/walking"  # 보행자 프로필

# ── 튜닝값(설계서 §4 참고, 절대기준 아님) ────────────────────────────────────
MIN_TRACE_POINTS = 4          # 매칭에 보낼 최소 좌표 수(적으면 신뢰 낮음). Mapbox 허용 2~100.
MAX_TRACE_POINTS = 25         # 전송 상한(latency·비용 절약, 100 이내).
MIN_CONFIDENCE = 0.30         # matching confidence 가 이보다 낮으면 판단 보류(None)→기존 동작.
RADIUS_M = 25.0               # 각 점 스냅 허용 반경(Mapbox 0~50).
DEVIATION_CONFIRM_M = 20.0    # 스냅된 최신 위치가 계획 경로에서 이만큼 넘게 떨어지면 '진짜 이탈'.
REQUEST_TIMEOUT_S = 4.0       # HTTP 타임아웃(초).

_TOKEN_KEYS = ("MAPBOX_TOKEN", "MAPBOX_ACCESS_TOKEN")


# ── 토큰(비밀) ────────────────────────────────────────────────────────────────
def _token() -> Optional[str]:
    """MAPBOX_TOKEN 을 env → st.secrets 순으로 읽는다. 없으면 None. 값은 절대 반환 외 노출 안 함."""
    for k in _TOKEN_KEYS:
        v = os.environ.get(k)
        if v:
            return v.strip()
    try:  # Streamlit Cloud secrets — import 실패·무키 모두 안전하게 무시
        import streamlit as st  # noqa: WPS433

        secrets = getattr(st, "secrets", None)
        if secrets is not None:
            for k in _TOKEN_KEYS:
                try:
                    v = secrets.get(k)
                except Exception:  # noqa: BLE001 — secrets 미설정 접근 예외 방어
                    v = None
                if v:
                    return str(v).strip()
    except Exception:  # noqa: BLE001 — streamlit 미존재/런타임 밖
        pass
    return None


def enabled() -> bool:
    """MAPBOX 토큰이 설정돼 있어 확인층을 쓸 수 있으면 True. 없으면 False(휴면)."""
    return _token() is not None


# ── 기하 헬퍼(외부 의존 없음, walking 스케일 근사) ───────────────────────────
def _haversine_m(a: Coord, b: Coord) -> float:
    r = 6371000.0
    lon1, lat1 = a
    lon2, lat2 = b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def _to_local_m(origin: Coord, p: Coord) -> Tuple[float, float]:
    """origin 기준 동/북 방향 미터(등거리 근사). 짧은 보행 구간에서 충분히 정확."""
    r = 6371000.0
    olon, olat = origin
    lon, lat = p
    x = math.radians(lon - olon) * math.cos(math.radians(olat)) * r
    y = math.radians(lat - olat) * r
    return (x, y)


def _point_seg_dist_m(p: Coord, a: Coord, b: Coord) -> float:
    """점 p 에서 선분 a-b 까지의 최단거리(m). 모든 좌표 (lon,lat)."""
    ax, ay = 0.0, 0.0  # a 를 원점으로
    bx, by = _to_local_m(a, b)
    px, py = _to_local_m(a, p)
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    if seg2 <= 1e-9:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / seg2
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def _dist_to_polyline_m(p: Coord, polyline: Sequence[Coord]) -> float:
    """점 p 에서 폴리라인(연속 선분)까지 최단거리(m). 빈 폴리라인이면 inf."""
    if not polyline:
        return float("inf")
    if len(polyline) == 1:
        return _haversine_m(p, polyline[0])
    return min(
        _point_seg_dist_m(p, polyline[i], polyline[i + 1])
        for i in range(len(polyline) - 1)
    )


# ── 좌표 준비 ────────────────────────────────────────────────────────────────
def _prep_coords(coords: Sequence[Coord]) -> List[Coord]:
    """연속 중복 제거 + 최근 MAX_TRACE_POINTS 개만 남긴다."""
    out: List[Coord] = []
    for c in coords:
        if len(c) < 2:
            continue
        pt = (float(c[0]), float(c[1]))
        if out and _haversine_m(out[-1], pt) < 0.5:  # 0.5m 미만 이동은 중복으로 간주
            continue
        out.append(pt)
    if len(out) > MAX_TRACE_POINTS:
        out = out[-MAX_TRACE_POINTS:]
    return out


# ── URL 빌더(순수) ───────────────────────────────────────────────────────────
def build_matching_url(
    coords: Sequence[Coord],
    *,
    token: str,
    profile: str = _PROFILE,
    radius_m: float = RADIUS_M,
) -> str:
    """Map Matching GET URL 을 만든다. coords=(lon,lat) 리스트."""
    coord_str = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in coords)
    query = {
        "access_token": token,
        "geometries": "geojson",
        "overview": "full",
        "tidy": "true",
        "radiuses": ";".join(f"{radius_m:g}" for _ in coords),
    }
    return _MATCH_URL.format(profile=profile, coords=coord_str) + "?" + _urlparse.urlencode(query)


# ── 응답 파싱(순수) ──────────────────────────────────────────────────────────
@dataclass(frozen=True)
class MatchResult:
    confidence: float
    matched: Tuple[Coord, ...]  # 스냅된 geojson 좌표들 (lon,lat)


def parse_matching_response(payload: object) -> Optional[MatchResult]:
    """Mapbox 응답 JSON(dict)을 MatchResult 로. 형식 불량·매칭 없음이면 None."""
    if not isinstance(payload, dict) or payload.get("code") != "Ok":
        return None
    matchings = payload.get("matchings") or []
    if not matchings:
        return None
    first = matchings[0]
    conf = first.get("confidence")
    geometry = first.get("geometry") or {}
    raw = geometry.get("coordinates") or []
    pts: List[Coord] = []
    for c in raw:
        if isinstance(c, (list, tuple)) and len(c) >= 2:
            pts.append((float(c[0]), float(c[1])))
    if conf is None or not pts:
        return None
    return MatchResult(confidence=float(conf), matched=tuple(pts))


# ── 판정(순수) ───────────────────────────────────────────────────────────────
def decide_from_match(
    match: Optional[MatchResult],
    planned_polyline: Sequence[Coord],
    *,
    confirm_m: float = DEVIATION_CONFIRM_M,
    min_confidence: float = MIN_CONFIDENCE,
) -> Optional[bool]:
    """스냅 결과로 이탈 후보를 판정한다.
    반환: True = 진짜 이탈(재탐색 진행) / False = 경로 위(재탐색 거부) / None = 판단 보류(기존 동작).
    """
    if match is None or match.confidence < min_confidence or not match.matched:
        return None
    if len(planned_polyline) < 2:
        return None
    snapped_latest = match.matched[-1]
    dist = _dist_to_polyline_m(snapped_latest, planned_polyline)
    return dist > confirm_m


# ── HTTP 호출(얇은 층) ───────────────────────────────────────────────────────
def match_trace(coords: Sequence[Coord]) -> Optional[MatchResult]:
    """최근 GPS 궤적을 Mapbox 도로망에 스냅. 토큰 없음/좌표 부족/네트워크 오류면 None."""
    tok = _token()
    if tok is None:
        return None
    pts = _prep_coords(coords)
    if len(pts) < MIN_TRACE_POINTS:
        return None
    url = build_matching_url(pts, token=tok)
    try:
        req = _urlrequest.Request(url, headers={"User-Agent": "walk-nav/1.0"})
        with _urlrequest.urlopen(req, timeout=REQUEST_TIMEOUT_S) as resp:  # noqa: S310 — https 고정
            payload = json.loads(resp.read().decode("utf-8"))
    except (_urlerror.URLError, ValueError, TimeoutError, OSError):
        return None
    return parse_matching_response(payload)


def confirm_deviation(
    coords: Sequence[Coord],
    planned_polyline: Sequence[Coord],
) -> Optional[bool]:
    """이탈 후보를 실제 도로 기준으로 확정/거부(HTTP 포함).
    True=진짜 이탈, False=경로 위(veto), None=판단 보류(토큰無·저신뢰·네트워크오류 → 기존 동작).
    """
    return decide_from_match(match_trace(coords), planned_polyline)
