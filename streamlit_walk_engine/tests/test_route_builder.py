"""
Unit tests for route_builder.py — TMAP 보행자 경로 응답 파싱 + 엔진 선택(dispatcher) 검증.

커버 범위:
  _route_from_tmap_features → LineString 병합/중복 제거, turnType 좌·우회전 매핑,
                              경계(시작/끝) 회전 제외, 좌표 부족 시 ValueError
  fetch_walking_route       → 앱키 있음(TMAP), TMAP 실패 시 Valhalla 대체, 앱키 없음(Valhalla)
  route_engine_label        → 사용 엔진에 따른 라벨 문자열
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import route_builder
from engine import Coordinate, RouteModel
from route_builder import _route_from_tmap_features


def _point(turn_type, lon, lat):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"turnType": turn_type},
    }


def _line(*coords):
    return {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": [list(c) for c in coords]},
        "properties": {},
    }


# 실제 TMAP 응답 구조: Point(SP) → LineString → Point(GP) → LineString → ... → Point(EP)
# 구간 경계 좌표는 직전 LineString 끝 = Point = 다음 LineString 시작으로 3회 중복 등장
A, B, C, D, E, F = (
    (126.9780, 37.5662), (126.9776, 37.5662), (126.9774, 37.5662),
    (126.9774, 37.5655), (126.9775, 37.5652), (126.9752, 37.5652),
)


class TestRouteFromTmapFeatures:
    def test_polyline_merges_linestrings_and_dedupes_junctions(self):
        route = _route_from_tmap_features([
            _point(200, *A),          # 출발지
            _line(A, B, C),
            _point(12, *C),           # 좌회전
            _line(C, D, E),
            _point(213, *E),          # 우측 횡단보도 — 회전 지점 아님
            _line(E, F),
            _point(201, *F),          # 도착지
        ])
        assert len(route.polyline) == 6
        assert route.polyline[0] == Coordinate(latitude=A[1], longitude=A[0])
        assert route.polyline[-1] == Coordinate(latitude=F[1], longitude=F[0])

    def test_left_and_right_turn_mapping(self):
        route = _route_from_tmap_features([
            _point(200, *A),
            _line(A, B, C),
            _point(12, *C),           # 좌회전 → polyline 인덱스 2
            _line(C, D),
            _point(13, *D),           # 우회전 → polyline 인덱스 3
            _line(D, E, F),
            _point(201, *F),
        ])
        assert [(tp.route_index, tp.direction) for tp in route.turn_points] == [
            (2, "left"), (3, "right"),
        ]
        assert route.turn_points[0].coordinate == Coordinate(latitude=C[1], longitude=C[0])
        assert [tp.id for tp in route.turn_points] == ["turn-1", "turn-2"]

    def test_clock_direction_turn_types(self):
        # 16/17 = 8시·10시 방향 좌회전, 18/19 = 2시·4시 방향 우회전
        for turn_type, expected in ((16, "left"), (17, "left"), (18, "right"), (19, "right")):
            route = _route_from_tmap_features([
                _line(A, B, C),
                _point(turn_type, *C),
                _line(C, D, E),
            ])
            assert route.turn_points[0].direction == expected

    def test_non_turn_point_types_ignored(self):
        # 11 직진 / 14 유턴 / 211 횡단보도 / 200 출발 / 201 도착 — 회전 지점 미생성
        route = _route_from_tmap_features([
            _point(200, *A),
            _line(A, B),
            _point(11, *B),
            _line(B, C),
            _point(211, *C),
            _line(C, D),
            _point(14, *D),
            _line(D, E),
            _point(201, *E),
        ])
        assert route.turn_points == ()

    def test_turn_at_route_boundaries_filtered(self):
        # 시작점(이전 LineString 없음)과 마지막 좌표의 회전은 접근/이탈 구간이 없어 제외
        route = _route_from_tmap_features([
            _point(12, *A),           # polyline 비어 있음 → index -1 → 제외
            _line(A, B, C),
            _point(13, *C),           # 마지막 좌표 → 제외
        ])
        assert route.turn_points == ()

    def test_too_few_coordinates_raises(self):
        with pytest.raises(ValueError):
            _route_from_tmap_features([_point(200, *A), _line(A)])


class TestFetchWalkingRouteDispatch:
    @pytest.fixture(autouse=True)
    def _reset_engine_state(self):
        route_builder._last_engine_used = None
        route_builder._last_tmap_error = None
        yield
        route_builder._last_engine_used = None
        route_builder._last_tmap_error = None

    def _dummy_route(self):
        return RouteModel(
            polyline=(
                Coordinate(latitude=A[1], longitude=A[0]),
                Coordinate(latitude=B[1], longitude=B[0]),
            ),
            turn_points=(),
        )

    def test_uses_tmap_when_key_present(self, monkeypatch):
        expected = self._dummy_route()
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        monkeypatch.setattr(
            route_builder, "_fetch_walking_route_tmap",
            lambda origin, dest, key: expected,
        )
        origin, dest = expected.polyline
        assert route_builder.fetch_walking_route(origin, dest) is expected
        assert "TMAP" in route_builder.route_engine_label()

    def test_falls_back_to_valhalla_on_tmap_error(self, monkeypatch):
        expected = self._dummy_route()

        def _boom(origin, dest, key):
            raise ValueError("TMAP 경로 탐색 실패: 1100 호출 한도 초과")

        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        monkeypatch.setattr(route_builder, "_fetch_walking_route_tmap", _boom)
        monkeypatch.setattr(
            route_builder, "_fetch_walking_route_valhalla",
            lambda origin, dest: expected,
        )
        origin, dest = expected.polyline
        assert route_builder.fetch_walking_route(origin, dest) is expected
        label = route_builder.route_engine_label()
        assert "Valhalla" in label and "대체" in label

    def test_uses_valhalla_without_key(self, monkeypatch):
        expected = self._dummy_route()
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: None)
        monkeypatch.setattr(
            route_builder, "_fetch_walking_route_valhalla",
            lambda origin, dest: expected,
        )
        origin, dest = expected.polyline
        assert route_builder.fetch_walking_route(origin, dest) is expected
        assert "Valhalla" in route_builder.route_engine_label()


class TestTmapAppKey:
    def test_env_var_wins(self, monkeypatch):
        monkeypatch.setenv("TMAP_APP_KEY", "  env-key  ")
        assert route_builder._tmap_app_key() == "env-key"

    def test_missing_everywhere_returns_none(self, monkeypatch):
        monkeypatch.delenv("TMAP_APP_KEY", raising=False)
        # secrets 파일이 없는 환경에서는 st.secrets 접근이 예외 → None
        assert route_builder._tmap_app_key() is None
