# -*- coding: utf-8 -*-
"""mapbox_matcher 단위 테스트 — 순수 로직(URL·파싱·판정)과 무토큰 안전동작을 네트워크 없이 검증.

토큰이 없으면 호출 자체를 안 하고(휴면) 판단 보류(None)를 돌려 기존 내비 동작을 보존한다는 점,
스냅된 위치가 경로 위면 재탐색을 거부(False), 확실히 벗어나면 확정(True)한다는 점을 확인한다.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mapbox_matcher as mm  # noqa: E402

# 서울 시청 부근 세로선 경로(경도 고정 → 점의 동쪽 오프셋 ≈ 경로까지 거리)
_PLANNED = [(126.978, 37.5665), (126.978, 37.5700)]
_LON_PER_M = 1.0 / (88300.0)  # 위도 37.5°에서 경도 1m ≈ 이 각도


def _pt_east(meters: float, lat: float = 37.5680):
    return (126.978 + meters * _LON_PER_M, lat)


def _match(conf: float, last_pt):
    return mm.MatchResult(confidence=conf, matched=((126.978, 37.5670), last_pt))


# ── 토큰/휴면 ────────────────────────────────────────────────────────────────
def test_enabled_true_when_env_token_set(monkeypatch):
    monkeypatch.setenv("MAPBOX_TOKEN", "pk.test_token")
    assert mm.enabled() is True
    assert mm._token() == "pk.test_token"


def test_no_token_means_dormant_no_network(monkeypatch):
    # env·secrets 모두 없는 상태를 강제 → 네트워크 호출 없이 None(보류) 반환
    monkeypatch.setattr(mm, "_token", lambda: None)
    assert mm.enabled() is False
    assert mm.match_trace([_pt_east(0)] * 5) is None
    assert mm.confirm_deviation([_pt_east(0)] * 5, _PLANNED) is None


# ── URL 빌더 ─────────────────────────────────────────────────────────────────
def test_build_matching_url_shape():
    coords = [(126.978, 37.5665), (126.9781, 37.5670), (126.9782, 37.5675)]
    url = mm.build_matching_url(coords, token="pk.tok")
    assert "matching/v5/mapbox/walking" in url
    assert "geometries=geojson" in url
    assert "access_token=pk.tok" in url
    # 경로 좌표는 세미콜론 구분 → 3좌표면 세미콜론 2개
    path = url.split("?", 1)[0]
    assert path.count(";") == len(coords) - 1
    assert "radiuses=" in url


# ── 응답 파싱 ────────────────────────────────────────────────────────────────
def test_parse_ok():
    payload = {
        "code": "Ok",
        "matchings": [{
            "confidence": 0.92,
            "geometry": {"type": "LineString",
                         "coordinates": [[126.978, 37.5665], [126.978, 37.5680]]},
        }],
    }
    res = mm.parse_matching_response(payload)
    assert res is not None
    assert abs(res.confidence - 0.92) < 1e-9
    assert res.matched[-1] == (126.978, 37.5680)


def test_parse_rejects_bad_payloads():
    assert mm.parse_matching_response({"code": "NoMatch", "matchings": []}) is None
    assert mm.parse_matching_response({"code": "Ok", "matchings": []}) is None
    assert mm.parse_matching_response({"code": "Ok", "matchings": [{"geometry": {"coordinates": [[1, 2]]}}]}) is None  # confidence 없음
    assert mm.parse_matching_response("nope") is None


# ── 판정(순수) ───────────────────────────────────────────────────────────────
def test_decide_on_route_vetoes():
    # 경로에서 5m → 코리도어 안 → False(재탐색 거부)
    assert mm.decide_from_match(_match(0.9, _pt_east(5)), _PLANNED) is False


def test_decide_off_route_confirms():
    # 경로에서 40m → 확실히 벗어남 → True(재탐색 진행)
    assert mm.decide_from_match(_match(0.9, _pt_east(40)), _PLANNED) is True


def test_decide_low_confidence_holds():
    assert mm.decide_from_match(_match(0.1, _pt_east(40)), _PLANNED) is None


def test_decide_none_match_holds():
    assert mm.decide_from_match(None, _PLANNED) is None


def test_decide_short_route_holds():
    assert mm.decide_from_match(_match(0.9, _pt_east(40)), [(126.978, 37.5665)]) is None


# ── 거리 헬퍼 sanity ─────────────────────────────────────────────────────────
def test_distance_to_polyline_matches_offset():
    d5 = mm._dist_to_polyline_m(_pt_east(5), _PLANNED)
    d40 = mm._dist_to_polyline_m(_pt_east(40), _PLANNED)
    assert 3.0 < d5 < 8.0
    assert 35.0 < d40 < 45.0
