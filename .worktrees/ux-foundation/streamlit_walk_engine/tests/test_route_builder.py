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
from route_builder import (
    RouteInfo, _route_from_tmap_features, strip_postcode, format_place_label,
    format_distance, label_with_distance, sort_suggestions_by_distance,
)


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


class TestStripPostcode:
    """우편번호 제거 순수함수 — 쉼표 경계 5자리만 제거, 나머지 보존."""

    def test_removes_comma_bounded_postcode(self):
        assert strip_postcode("A, 06141, B") == "A, B"

    def test_removes_postcode_in_full_nominatim_address(self):
        addr = "No Brand Burger, 테헤란로, 역삼1동, 강남구, 서울특별시, 06141, 대한민국"
        expected = "No Brand Burger, 테헤란로, 역삼1동, 강남구, 서울특별시, 대한민국"
        assert strip_postcode(addr) == expected

    def test_preserves_space_form_5digits(self):
        # 공백형(Naver) 주소 — 우편번호 없음, 쉼표 경계 아닌 5자리는 보존
        assert strip_postcode("서울특별시 강남구 테헤란로 12345") == "서울특별시 강남구 테헤란로 12345"

    def test_preserves_3digit_building_number(self):
        assert strip_postcode("테헤란로 152, 강남구") == "테헤란로 152, 강남구"

    def test_preserves_5digit_not_comma_bounded(self):
        # 5자리지만 뒤가 쉼표가 아니면(문자) 보존
        assert strip_postcode("A, 12345 동, B") == "A, 12345 동, B"

    def test_idempotent_without_postcode(self):
        assert strip_postcode("A, B") == "A, B"

    def test_idempotent_after_strip(self):
        once = strip_postcode("A, 06141, B")
        assert strip_postcode(once) == once

    def test_none_passthrough(self):
        assert strip_postcode(None) is None

    def test_empty_passthrough(self):
        assert strip_postcode("") == ""


class TestFormatPlaceLabel:
    """검색 후보 라벨 정제 — 우편번호·국가·광역시도만 제거, 도로·번지·동·구 유지(후보 구분)."""

    def test_nominatim_keeps_detail_drops_country_metro(self):
        d = "합정역, 양화로, 홍대, 서교동, 마포구, 서울특별시, 04037, 대한민국"
        assert format_place_label(d) == "합정역, 양화로, 홍대, 서교동, 마포구"

    def test_two_candidates_distinguished(self):
        d1 = "합정역, 양화로, 홍대, 서교동, 마포구, 서울특별시, 04037, 대한민국"
        d2 = "합정역, 양화로, 합정동, 마포구, 서울특별시, 04027, 대한민국"
        assert format_place_label(d1) != format_place_label(d2)

    def test_poi_only(self):
        assert format_place_label("경복궁, 대한민국") == "경복궁"

    def test_gu_kept(self):
        assert format_place_label("강남역, 강남구, 서울특별시, 대한민국") == "강남역, 강남구"

    def test_naver_road_address_drops_metro_prefix(self):
        # Naver 공백형(도로명주소) — 앞 광역시도만 떼고 번지까지 유지
        assert format_place_label("서울특별시 마포구 양화로 45") == "마포구 양화로 45"

    def test_none_and_empty(self):
        assert format_place_label(None) == ""
        assert format_place_label("") == ""


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


class _FakeResp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class TestGeocodeSuggestions:
    """경로 탐색 전 후보 미리보기용 다중 후보 검색."""

    def test_empty_query_returns_empty_without_network(self, monkeypatch):
        # 빈/공백 검색어는 네트워크 호출 없이 즉시 [] — get이 불리면 실패하도록 강제
        def _boom(*a, **k):
            raise AssertionError("빈 검색어에 네트워크를 호출하면 안 됨")
        monkeypatch.setattr(route_builder.requests, "get", _boom)
        assert route_builder.geocode_suggestions("") == []
        assert route_builder.geocode_suggestions("   ") == []

    def test_naver_returns_multiple_candidates(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_headers", lambda: {"X": "y"})
        payload = {"addresses": [
            {"y": "37.5759", "x": "126.9769", "roadAddress": "서울 종로구 사직로 161"},
            {"y": "37.5765", "x": "126.9770", "jibunAddress": "서울 종로구 세종로 1-1"},
        ]}
        monkeypatch.setattr(route_builder.requests, "get", lambda *a, **k: _FakeResp(200, payload))
        out = route_builder.geocode_suggestions("경복궁", limit=5)
        assert len(out) == 2
        assert out[0][1] == "서울 종로구 사직로 161"
        assert abs(out[0][0].latitude - 37.5759) < 1e-6

    def test_falls_back_to_nominatim_without_naver_key(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_headers", lambda: None)
        hits = [{"lat": "37.4979", "lon": "127.0276", "display_name": "강남역"}]
        monkeypatch.setattr(route_builder.requests, "get", lambda *a, **k: _FakeResp(200, hits))
        out = route_builder.geocode_suggestions("강남역", limit=5)
        assert len(out) == 1
        assert out[0][1] == "강남역"

    def test_dedupes_by_coordinate(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_headers", lambda: {"X": "y"})
        payload = {"addresses": [
            {"y": "37.5", "x": "127.0", "roadAddress": "동일좌표 A"},
            {"y": "37.5", "x": "127.0", "roadAddress": "동일좌표 B"},
        ]}
        monkeypatch.setattr(route_builder.requests, "get", lambda *a, **k: _FakeResp(200, payload))
        out = route_builder.geocode_suggestions("중복", limit=5)
        assert len(out) == 1  # 같은 좌표는 1개로 합쳐짐

    def test_network_error_returns_empty_gracefully(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_headers", lambda: None)

        def _raise(*a, **k):
            raise route_builder.requests.RequestException("boom")
        monkeypatch.setattr(route_builder.requests, "get", _raise)
        # 예외가 호출부로 전파되지 않고 [] 반환
        assert route_builder.geocode_suggestions("아무거나") == []


class _FakeSecrets:
    def __init__(self, data):
        self._data = data

    def get(self, key, default=None):
        return self._data.get(key, default)


class TestNaverHeaders:
    """Naver 키 공급원: 환경변수 → st.secrets(Streamlit Cloud) → 마스터 .env."""

    def test_env_vars_provide_headers(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_keys_cache", False)
        monkeypatch.setenv("NAVER_MAPS_CLIENT_ID", "cid-env")
        monkeypatch.setenv("NAVER_MAPS_CLIENT_SECRET", "sec-env")
        h = route_builder._naver_headers()
        assert h is not None
        assert h["X-NCP-APIGW-API-KEY-ID"] == "cid-env"
        assert h["X-NCP-APIGW-API-KEY"] == "sec-env"

    def test_streamlit_secrets_provide_headers_on_cloud(self, monkeypatch, tmp_path):
        # Cloud 시나리오: 환경변수·마스터 .env 없음, st.secrets 만 키 제공 → 헤더 생성돼야 함
        monkeypatch.setattr(route_builder, "_naver_keys_cache", False)
        monkeypatch.delenv("NAVER_MAPS_CLIENT_ID", raising=False)
        monkeypatch.delenv("NAVER_MAPS_CLIENT_SECRET", raising=False)
        monkeypatch.setattr(route_builder, "_ENV_SHARED", tmp_path / "absent.env")
        import streamlit
        monkeypatch.setattr(streamlit, "secrets", _FakeSecrets(
            {"NAVER_MAPS_CLIENT_ID": "cid-cloud", "NAVER_MAPS_CLIENT_SECRET": "sec-cloud"}))
        h = route_builder._naver_headers()
        assert h is not None
        assert h["X-NCP-APIGW-API-KEY-ID"] == "cid-cloud"
        assert h["X-NCP-APIGW-API-KEY"] == "sec-cloud"

    def test_none_when_no_source(self, monkeypatch, tmp_path):
        # 어떤 공급원도 키를 주지 않으면 None → geocode_address가 Nominatim으로 폴백
        monkeypatch.setattr(route_builder, "_naver_keys_cache", False)
        monkeypatch.delenv("NAVER_MAPS_CLIENT_ID", raising=False)
        monkeypatch.delenv("NAVER_MAPS_CLIENT_SECRET", raising=False)
        monkeypatch.setattr(route_builder, "_ENV_SHARED", tmp_path / "absent.env")
        import streamlit
        monkeypatch.setattr(streamlit, "secrets", _FakeSecrets({}))
        assert route_builder._naver_headers() is None


class TestFormatDistance:
    """거리(m) → 사람이 읽는 문자열. 1km 미만은 10m단위 'NNNm', 이상은 'N.Nkm'."""

    def test_meters_rounded_to_ten(self):
        assert format_distance(253) == "250m"
        assert format_distance(258) == "260m"

    def test_small_distance_floors_to_10m(self):
        # 10m 미만·0도 최소 '10m'로 표시해 '0m' 같은 어색한 표기를 피한다.
        assert format_distance(3) == "10m"
        assert format_distance(0) == "10m"

    def test_kilometers_one_decimal(self):
        assert format_distance(1000) == "1.0km"
        assert format_distance(1234) == "1.2km"
        assert format_distance(5600) == "5.6km"

    def test_negative_is_clamped(self):
        assert format_distance(-10) == "10m"

    def test_non_numeric_returns_empty(self):
        assert format_distance("abc") == ""
        assert format_distance(None) == ""

    def test_non_finite_returns_empty(self):
        assert format_distance(float("inf")) == ""
        assert format_distance(float("nan")) == ""

    def test_km_boundary_rounds_up(self):
        # 995~999m는 반올림 'NNNm'(1000m)이 아니라 '1.0km'로 표시(km 경계 정돈).
        assert format_distance(999) == "1.0km"
        assert format_distance(994) == "990m"


class TestLabelWithDistance:
    """검색 후보 라벨에 현재 위치 기준 거리 접미(origin/coord 없으면 라벨만)."""

    _DEST = Coordinate(latitude=37.5665, longitude=126.9780)

    def test_no_origin_returns_plain_label(self):
        disp = "테헤란로 152, 강남구"
        assert label_with_distance(disp, self._DEST, None) == format_place_label(disp)

    def test_no_coord_returns_plain_label(self):
        disp = "테헤란로 152, 강남구"
        assert label_with_distance(disp, None, self._DEST) == format_place_label(disp)

    def test_appends_distance_when_origin_present(self):
        origin = Coordinate(latitude=37.5665, longitude=126.9780)  # 목적지와 동일 → 0m→'10m'
        result = label_with_distance("서울특별시 중구 세종대로 110", self._DEST, origin)
        assert result.startswith("중구 세종대로 110")
        assert result.endswith(" · 10m")

    def test_distance_only_when_label_empty(self):
        origin = Coordinate(latitude=37.5000, longitude=127.0000)
        dest = Coordinate(latitude=37.5000, longitude=127.0000)
        # 표시문자열이 비면 라벨 없이 거리만(' · ' 접두 없이).
        assert label_with_distance("", dest, origin) == "10m"
        assert label_with_distance(None, dest, origin) == "10m"


class TestSortSuggestionsByDistance:
    """origin(현재 위치) 기준 가까운 순 정렬. origin None이면 원순서·안정."""

    _ORIGIN = Coordinate(latitude=37.5000, longitude=127.0000)
    _NEAR = Coordinate(latitude=37.5001, longitude=127.0000)   # 약 11m
    _FAR = Coordinate(latitude=37.5100, longitude=127.0000)    # 약 1.1km

    def test_none_origin_keeps_order(self):
        sugg = [(self._FAR, "far"), (self._NEAR, "near")]
        assert sort_suggestions_by_distance(sugg, None) == sugg

    def test_sorts_nearest_first(self):
        sugg = [(self._FAR, "far"), (self._NEAR, "near")]
        out = sort_suggestions_by_distance(sugg, self._ORIGIN)
        assert [d for _, d in out] == ["near", "far"]

    def test_empty_list(self):
        assert sort_suggestions_by_distance([], self._ORIGIN) == []

    def test_stable_for_equal_distance(self):
        same = Coordinate(latitude=37.5050, longitude=127.0000)
        sugg = [(same, "a"), (same, "b")]
        out = sort_suggestions_by_distance(sugg, self._ORIGIN)
        assert [d for _, d in out] == ["a", "b"]

    def test_does_not_mutate_input(self):
        sugg = [(self._FAR, "far"), (self._NEAR, "near")]
        original = list(sugg)
        sort_suggestions_by_distance(sugg, self._ORIGIN)
        assert sugg == original


class TestTmapPoiResults:
    """TMAP 장소(POI) 검색 — 키 없으면 네트워크 없이 빈 리스트, front→noor 좌표 우선."""

    def test_no_key_returns_empty_without_network(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: None)
        def _boom(*a, **k):
            raise AssertionError("키 없으면 네트워크를 호출하면 안 됨")
        monkeypatch.setattr(route_builder.requests, "get", _boom)
        assert route_builder._tmap_poi_results("경복궁") == []

    def test_parses_pois_with_front_coords(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        payload = {"searchPoiInfo": {"pois": {"poi": [
            {"name": "경복궁", "frontLat": "37.5759", "frontLon": "126.9769",
             "upperAddrName": "서울", "middleAddrName": "종로구"},
        ]}}}
        monkeypatch.setattr(route_builder.requests, "get", lambda *a, **k: _FakeResp(200, payload))
        out = route_builder._tmap_poi_results("경복궁")
        assert len(out) == 1
        coord, display = out[0]
        assert abs(coord.latitude - 37.5759) < 1e-6
        assert display == "경복궁, 서울 종로구"

    def test_falls_back_to_noor_when_front_zero(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        payload = {"searchPoiInfo": {"pois": {"poi": [
            {"name": "A", "frontLat": "0", "frontLon": "0",
             "noorLat": "37.5", "noorLon": "127.0"},
        ]}}}
        monkeypatch.setattr(route_builder.requests, "get", lambda *a, **k: _FakeResp(200, payload))
        out = route_builder._tmap_poi_results("A")
        assert len(out) == 1
        assert abs(out[0][0].longitude - 127.0) < 1e-6

    def test_non_200_returns_empty(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        monkeypatch.setattr(route_builder.requests, "get", lambda *a, **k: _FakeResp(403, {}))
        assert route_builder._tmap_poi_results("경복궁") == []

    def test_skips_poi_without_usable_coords(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        payload = {"searchPoiInfo": {"pois": {"poi": [
            {"name": "좌표없음"},
            {"name": "정상", "noorLat": "37.5", "noorLon": "127.0"},
        ]}}}
        monkeypatch.setattr(route_builder.requests, "get", lambda *a, **k: _FakeResp(200, payload))
        out = route_builder._tmap_poi_results("x")
        assert [d for _, d in out] == ["정상"]


class TestTmapReverse:
    """TMAP Reverse Geocoding — 키 없으면 None, 성공 시 fullAddress."""

    _COORD = Coordinate(latitude=37.5665, longitude=126.9780)

    def test_no_key_returns_none_without_network(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: None)
        def _boom(*a, **k):
            raise AssertionError("키 없으면 네트워크를 호출하면 안 됨")
        monkeypatch.setattr(route_builder.requests, "get", _boom)
        assert route_builder._tmap_reverse(self._COORD) is None

    def test_returns_full_address(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        payload = {"addressInfo": {"fullAddress": "서울특별시 중구 세종대로 110"}}
        monkeypatch.setattr(route_builder.requests, "get", lambda *a, **k: _FakeResp(200, payload))
        assert route_builder._tmap_reverse(self._COORD) == "서울특별시 중구 세종대로 110"

    def test_non_200_returns_none(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        monkeypatch.setattr(route_builder.requests, "get", lambda *a, **k: _FakeResp(403, {}))
        assert route_builder._tmap_reverse(self._COORD) is None

    def test_reverse_geocode_uses_tmap_before_nominatim(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_reverse", lambda c: None)
        monkeypatch.setattr(route_builder, "_tmap_reverse", lambda c: "TMAP 주소")
        def _boom(*a, **k):
            raise AssertionError("TMAP 성공 시 Nominatim을 호출하면 안 됨")
        monkeypatch.setattr(route_builder.requests, "get", _boom)
        assert route_builder.reverse_geocode(self._COORD) == "TMAP 주소"


class TestGeocodeFallbackChain:
    """Naver → TMAP POI → Nominatim 폴백 순서 — POI가 잡히면 Nominatim 미호출."""

    def test_suggestions_use_tmap_poi_when_naver_empty(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_headers", lambda: None)
        hit = (Coordinate(latitude=37.5, longitude=127.0), "경복궁, 서울 종로구")
        monkeypatch.setattr(route_builder, "_tmap_poi_results", lambda q, limit=5: [hit])
        def _boom(*a, **k):
            raise AssertionError("POI 성공 시 Nominatim을 호출하면 안 됨")
        monkeypatch.setattr(route_builder.requests, "get", _boom)
        assert route_builder.geocode_suggestions("경복궁") == [hit]

    def test_geocode_address_uses_tmap_poi_when_naver_none(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_geocode", lambda q: None)
        hit = (Coordinate(latitude=37.5, longitude=127.0), "경복궁")
        monkeypatch.setattr(route_builder, "_tmap_poi_results", lambda q, limit=1: [hit])
        def _boom(*a, **k):
            raise AssertionError("POI 성공 시 Nominatim을 호출하면 안 됨")
        monkeypatch.setattr(route_builder.requests, "get", _boom)
        assert route_builder.geocode_address("경복궁") == hit
