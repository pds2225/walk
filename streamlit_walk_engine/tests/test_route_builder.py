"""
Unit tests for route_builder.py — TMAP 보행자 경로 응답 파싱 + 엔진 선택(dispatcher) 검증.

커버 범위:
  _route_from_tmap_features        → LineString 병합/중복 제거, turnType 좌·우회전 매핑,
                                     경계(시작/끝) 회전 제외, 좌표 부족 시 ValueError,
                                     RouteInfo(총거리·소요시간·회전 안내문) 추출
  fetch_walking_route_with_engine  → 앱키 있음(TMAP), TMAP 실패 시 Valhalla 대체(라벨에 원인 포함),
                                     앱키 없음(Valhalla) — 전역 상태 없이 호출별 라벨 반환
  route_engine_label               → 앱키 유무에 따른 기본 라벨 문자열
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import route_builder
from engine import Coordinate, RouteModel
from route_builder import RouteInfo, _route_from_tmap_features


def _point(turn_type, lon, lat, description="", **extra_props):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"turnType": turn_type, "description": description, **extra_props},
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
        route, _ = _route_from_tmap_features([
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
        route, _ = _route_from_tmap_features([
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
            route, _ = _route_from_tmap_features([
                _line(A, B, C),
                _point(turn_type, *C),
                _line(C, D, E),
            ])
            assert route.turn_points[0].direction == expected

    def test_non_turn_point_types_ignored(self):
        # 11 직진 / 14 유턴 / 211 횡단보도 / 200 출발 / 201 도착 — 회전 지점 미생성
        route, _ = _route_from_tmap_features([
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
        route, _ = _route_from_tmap_features([
            _point(12, *A),           # polyline 비어 있음 → index -1 → 제외
            _line(A, B, C),
            _point(13, *C),           # 마지막 좌표 → 제외
        ])
        assert route.turn_points == ()

    def test_too_few_coordinates_raises(self):
        with pytest.raises(ValueError):
            _route_from_tmap_features([_point(200, *A), _line(A)])


class TestRouteInfoExtraction:
    def test_total_distance_time_and_turn_descriptions(self):
        # totalDistance/totalTime은 첫 피처(SP) properties에만 존재
        _, info = _route_from_tmap_features([
            _point(200, *A, totalDistance=435, totalTime=369),
            _line(A, B, C),
            _point(12, *C, description="시청역 5번출구에서 좌회전 후 세종대로를 따라 102m 이동"),
            _line(C, D, E),
            _point(201, *E),
        ])
        assert info.total_distance_meters == 435
        assert info.total_time_seconds == 369
        assert info.turn_descriptions == {
            "turn-1": "시청역 5번출구에서 좌회전 후 세종대로를 따라 102m 이동",
        }

    def test_missing_summary_fields_default_to_none(self):
        _, info = _route_from_tmap_features([
            _line(A, B, C),
            _point(12, *C),           # 안내문 없는 회전 → turn_descriptions에 미포함
            _line(C, D, E),
        ])
        assert info.total_distance_meters is None
        assert info.total_time_seconds is None
        assert info.turn_descriptions == {}

    def test_filtered_turn_has_no_description_entry(self):
        # 경계에서 제외된 회전의 안내문은 매핑에 남지 않아야 함
        route, info = _route_from_tmap_features([
            _line(A, B, C),
            _point(13, *C, description="마지막 좌표 회전 — 제외 대상"),
        ])
        assert route.turn_points == ()
        assert info.turn_descriptions == {}


class TestFetchWalkingRouteDispatch:
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
        expected_info = RouteInfo(total_distance_meters=435, total_time_seconds=369)
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        monkeypatch.setattr(
            route_builder, "_fetch_walking_route_tmap",
            lambda origin, dest, key: (expected, expected_info),
        )
        origin, dest = expected.polyline
        route, label, info = route_builder.fetch_walking_route_with_engine(origin, dest)
        assert route is expected
        assert "TMAP" in label
        assert info is expected_info

    def test_falls_back_to_valhalla_on_tmap_error(self, monkeypatch):
        expected = self._dummy_route()

        def _boom(origin, dest, key):
            raise ValueError("TMAP 경로 탐색 실패: 1100 호출 한도 초과")

        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        monkeypatch.setattr(route_builder, "_fetch_walking_route_tmap", _boom)
        monkeypatch.setattr(
            route_builder, "_fetch_walking_route_valhalla",
            lambda origin, dest: (expected, RouteInfo()),
        )
        origin, dest = expected.polyline
        route, label, info = route_builder.fetch_walking_route_with_engine(origin, dest)
        assert route is expected
        assert "Valhalla" in label and "대체" in label and "한도 초과" in label
        assert info == RouteInfo()

    def test_uses_valhalla_without_key(self, monkeypatch):
        expected = self._dummy_route()
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: None)
        monkeypatch.setattr(
            route_builder, "_fetch_walking_route_valhalla",
            lambda origin, dest: (expected, RouteInfo()),
        )
        origin, dest = expected.polyline
        route, label, info = route_builder.fetch_walking_route_with_engine(origin, dest)
        assert route is expected
        assert "Valhalla" in label and "대체" not in label

    def test_compat_wrapper_returns_route_only(self, monkeypatch):
        expected = self._dummy_route()
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: None)
        monkeypatch.setattr(
            route_builder, "_fetch_walking_route_valhalla",
            lambda origin, dest: (expected, RouteInfo()),
        )
        origin, dest = expected.polyline
        assert route_builder.fetch_walking_route(origin, dest) is expected


class TestRouteEngineLabel:
    def test_label_with_key(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        assert "TMAP" in route_builder.route_engine_label()

    def test_label_without_key(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: None)
        label = route_builder.route_engine_label()
        assert "Valhalla" in label and "미설정" in label


class TestTmapAppKey:
    def test_env_var_wins(self, monkeypatch):
        monkeypatch.setenv("TMAP_APP_KEY", "  env-key  ")
        assert route_builder._tmap_app_key() == "env-key"

    def test_missing_everywhere_returns_none(self, monkeypatch):
        monkeypatch.delenv("TMAP_APP_KEY", raising=False)
        # secrets 파일이 없는 환경에서는 st.secrets 접근이 예외 → None
        assert route_builder._tmap_app_key() is None


def _tmap_poi(name, front=None, noor=None, road="", upper="서울", middle="강남구", lower="역삼동"):
    poi = {
        "name": name,
        "upperAddrName": upper, "middleAddrName": middle, "lowerAddrName": lower,
        "newAddressList": {"newAddress": ([{"fullAddressRoad": road}] if road else [])},
    }
    if front:
        poi["frontLat"], poi["frontLon"] = str(front[1]), str(front[0])
    if noor:
        poi["noorLat"], poi["noorLon"] = str(noor[1]), str(noor[0])
    return poi


def _tmap_poi_payload(*pois):
    return {"searchPoiInfo": {"pois": {"poi": list(pois)}}}


class TestPoisFromTmapResponse:
    def test_front_coordinate_preferred_and_display_with_road(self):
        payload = _tmap_poi_payload(
            _tmap_poi("강남역 10번출구", front=(127.02707407, 37.49865740),
                      noor=(127.02699075, 37.49862962), road="서울 강남구 강남대로 지하 396"),
        )
        results = route_builder._pois_from_tmap_response(payload, limit=5)
        assert len(results) == 1
        coord, display = results[0]
        assert coord == Coordinate(latitude=37.49865740, longitude=127.02707407)
        assert display == "강남역 10번출구 · 서울 강남구 강남대로 지하 396"

    def test_noor_fallback_and_admin_address(self):
        payload = _tmap_poi_payload(_tmap_poi("어딘가", noor=(127.0, 37.5)))
        results = route_builder._pois_from_tmap_response(payload, limit=5)
        coord, display = results[0]
        assert coord == Coordinate(latitude=37.5, longitude=127.0)
        assert display == "어딘가 · 서울 강남구 역삼동"

    def test_zero_coordinates_skipped(self):
        payload = _tmap_poi_payload(_tmap_poi("좌표없음", front=(0.0, 0.0)))
        assert route_builder._pois_from_tmap_response(payload, limit=5) == []

    def test_limit_applied(self):
        payload = _tmap_poi_payload(*[
            _tmap_poi(f"poi-{i}", front=(127.0 + i * 0.001, 37.5)) for i in range(5)
        ])
        assert len(route_builder._pois_from_tmap_response(payload, limit=3)) == 3

    def test_empty_payload(self):
        assert route_builder._pois_from_tmap_response({}, limit=5) == []


class TestSearchPlacesDispatch:
    _COORD = Coordinate(latitude=37.5, longitude=127.0)

    def test_tmap_results_returned(self, monkeypatch):
        expected = [(self._COORD, "강남역 10번출구 · 서울 강남구")]
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        monkeypatch.setattr(
            route_builder, "_search_pois_tmap",
            lambda query, key, limit: expected,
        )
        assert route_builder.search_places("강남역 10번출구") == expected

    def test_tmap_empty_falls_back_to_nominatim(self, monkeypatch):
        fallback = (self._COORD, "Nominatim 결과")
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        monkeypatch.setattr(route_builder, "_search_pois_tmap", lambda q, k, n: [])
        monkeypatch.setattr(route_builder, "_geocode_nominatim", lambda q: fallback)
        assert route_builder.search_places("어딘가") == [fallback]

    def test_tmap_error_falls_back_to_nominatim(self, monkeypatch):
        fallback = (self._COORD, "Nominatim 결과")

        def _boom(query, key, limit):
            raise ValueError("TMAP 장소 검색 실패: 429")

        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        monkeypatch.setattr(route_builder, "_search_pois_tmap", _boom)
        monkeypatch.setattr(route_builder, "_geocode_nominatim", lambda q: fallback)
        assert route_builder.search_places("어딘가") == [fallback]

    def test_without_key_uses_nominatim(self, monkeypatch):
        fallback = (self._COORD, "Nominatim 결과")
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: None)
        monkeypatch.setattr(route_builder, "_geocode_nominatim", lambda q: fallback)
        assert route_builder.search_places("어딘가") == [fallback]

    def test_nothing_found_returns_empty(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: None)
        monkeypatch.setattr(route_builder, "_geocode_nominatim", lambda q: None)
        assert route_builder.search_places("없는곳") == []

    def test_geocode_address_returns_top_candidate(self, monkeypatch):
        expected = [(self._COORD, "후보1")]
        monkeypatch.setattr(route_builder, "search_places", lambda q, limit=5: expected)
        assert route_builder.geocode_address("어딘가") == expected[0]


class TestReverseGeocodeDispatch:
    _COORD = Coordinate(latitude=37.56629, longitude=126.97797)

    def test_tmap_address_used(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        monkeypatch.setattr(
            route_builder, "_reverse_geocode_tmap",
            lambda coord, key: "서울특별시 중구 세종대로 110 서울특별시청",
        )
        assert route_builder.reverse_geocode(self._COORD) == "서울특별시 중구 세종대로 110 서울특별시청"

    def test_tmap_error_falls_back_to_nominatim(self, monkeypatch):
        def _boom(coord, key):
            raise ValueError("TMAP 역지오코딩 실패: 500")

        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        monkeypatch.setattr(route_builder, "_reverse_geocode_tmap", _boom)
        monkeypatch.setattr(route_builder, "_reverse_geocode_nominatim", lambda c: "Nominatim 주소")
        assert route_builder.reverse_geocode(self._COORD) == "Nominatim 주소"

    def test_without_key_uses_nominatim(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: None)
        monkeypatch.setattr(route_builder, "_reverse_geocode_nominatim", lambda c: "Nominatim 주소")
        assert route_builder.reverse_geocode(self._COORD) == "Nominatim 주소"


class _FakeStaticMapResp:
    def __init__(self, status=200, content=b"", content_type="image/png;charset=UTF-8"):
        self.status_code = status
        self.content = content
        self.headers = {"Content-Type": content_type}


class TestStaticMap:
    _O = Coordinate(latitude=37.56629, longitude=126.97797)
    _D = Coordinate(latitude=37.56575, longitude=126.97515)

    def test_zoom_levels_by_distance(self):
        # 거리 경계: <300→17, <700→16, <1500→15, <3000→14, <6000→13, 그 외→12
        for distance, zoom in ((100, 17), (300, 16), (700, 15), (1500, 14), (3000, 13), (6000, 12)):
            assert route_builder._static_map_zoom(distance) == zoom

    def test_returns_png_bytes(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        monkeypatch.setattr(
            route_builder.requests, "get",
            lambda *a, **kw: _FakeStaticMapResp(content=b"PNGDATA"),
        )
        assert route_builder.fetch_static_map_png(self._O, self._D) == b"PNGDATA"

    def test_without_key_returns_none(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: None)
        assert route_builder.fetch_static_map_png(self._O, self._D) is None

    def test_error_status_returns_none(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        monkeypatch.setattr(
            route_builder.requests, "get",
            lambda *a, **kw: _FakeStaticMapResp(status=429, content_type="application/json"),
        )
        assert route_builder.fetch_static_map_png(self._O, self._D) is None

    def test_non_image_body_returns_none(self, monkeypatch):
        # 200이어도 에러 JSON이 오면 이미지로 표시하지 않음
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        monkeypatch.setattr(
            route_builder.requests, "get",
            lambda *a, **kw: _FakeStaticMapResp(content_type="application/json"),
        )
        assert route_builder.fetch_static_map_png(self._O, self._D) is None

    def test_dimensions_clamped_to_tmap_limit(self, monkeypatch):
        # 512 초과 요청은 서버가 잘라 반환하므로 요청 단계에서 명시적으로 클램프
        captured = {}

        def _capture(url, params=None, **kw):
            captured.update(params)
            return _FakeStaticMapResp(content=b"PNGDATA")

        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "test-key")
        monkeypatch.setattr(route_builder.requests, "get", _capture)
        route_builder.fetch_static_map_png(self._O, self._D, width=2048, height=1024)
        assert captured["width"] == 512
        assert captured["height"] == 512
