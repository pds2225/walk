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
    format_distance, format_korean_address, label_with_distance,
    sort_suggestions_by_distance,
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
    """검색 후보 라벨 — 한국식 순서(광역→세부), 국가·광역시도·우편번호 제거, 상세 유지."""

    def test_nominatim_reversed_to_korean_order(self):
        d = "합정역, 양화로, 홍대, 서교동, 마포구, 서울특별시, 04037, 대한민국"
        assert format_place_label(d) == "마포구 서교동 홍대 양화로 합정역"

    def test_two_candidates_distinguished(self):
        d1 = "합정역, 양화로, 홍대, 서교동, 마포구, 서울특별시, 04037, 대한민국"
        d2 = "합정역, 양화로, 합정동, 마포구, 서울특별시, 04027, 대한민국"
        assert format_place_label(d1) != format_place_label(d2)

    def test_poi_only(self):
        assert format_place_label("경복궁, 대한민국") == "경복궁"

    def test_gu_kept(self):
        assert format_place_label("강남역, 강남구, 서울특별시, 대한민국") == "강남구 강남역"

    def test_naver_road_address_drops_metro_prefix(self):
        # Naver 공백형(도로명주소) — 이미 한국식이라 순서 유지, 앞 광역시도만 제거
        assert format_place_label("서울특별시 마포구 양화로 45") == "마포구 양화로 45"

    def test_place_name_containing_country_word_preserved(self):
        # TMAP POI display 는 공백형 — '대한민국역사박물관'이 잘리면 후보 라벨이 깨진다.
        d = "서울 종로구 세종대로 대한민국역사박물관"
        assert format_place_label(d) == d

    def test_metro_only_falls_back_to_body(self):
        # 광역시도 토큰만 남으면 라벨이 비지 않도록 body로 폴백(빈 라벨 방지)
        assert format_place_label("서울특별시, 대한민국") == "서울특별시"

    def test_none_and_empty(self):
        assert format_place_label(None) == ""
        assert format_place_label("") == ""


class TestFormatKoreanAddress:
    """전체 주소 — 국가명 숨김, 우편번호 '(NNNNN)' 앞으로, 광역→세부 한국식 순서."""

    def test_nominatim_reversed_with_postcode_moved_to_front(self):
        d = "맥도날드, 백범로227번길, 만수5동, 남동구, 인천광역시, 21518, 대한민국"
        assert format_korean_address(d) == "(21518) 인천광역시 남동구 만수5동 백범로227번길 맥도날드"

    def test_country_hidden_without_postcode(self):
        assert format_korean_address("경복궁, 종로구, 서울특별시, 대한민국") == "서울특별시 종로구 경복궁"

    def test_space_form_order_kept_and_country_removed(self):
        # Naver/TMAP 공백형은 이미 한국식 순서 — 뒤집지 않는다.
        assert format_korean_address("서울특별시 강남구 테헤란로 152") == "서울특별시 강남구 테헤란로 152"
        assert format_korean_address("서울특별시 강남구 테헤란로 152 대한민국") == "서울특별시 강남구 테헤란로 152"

    def test_english_country_removed_and_reversed(self):
        assert format_korean_address("Gyeongbokgung, Jongno-gu, South Korea") == "Jongno-gu Gyeongbokgung"

    def test_five_digit_building_number_not_mistaken_for_postcode(self):
        # 공백형(Naver/TMAP)엔 우편번호가 없다 — 5자리 '번지'를 앞으로 옮기면 안 된다.
        assert format_korean_address("세종특별자치시 한누리대로 12345") == "세종특별자치시 한누리대로 12345"

    def test_place_name_containing_country_word_preserved(self):
        # '대한민국역사박물관'은 실존 장소 — 부분문자열 치환으로 잘리면 안 된다.
        d = "서울 종로구 세종대로 대한민국역사박물관"
        assert format_korean_address(d) == d

    def test_postcode_only_when_body_empty(self):
        # 본문이 전부 국가명/우편번호뿐이면 우편번호만 괄호로 남긴다(빈 문자열 아님)
        assert format_korean_address("06141, 대한민국") == "(06141)"

    def test_none_and_empty(self):
        assert format_korean_address(None) == ""
        assert format_korean_address("   ") == ""


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

    def test_missing_time_estimated_from_distance_at_4kmh(self):
        """API 가 totalTime 을 안 주면 시속 4km(사용자 지정 기준)로 추정해 표시가 비지 않는다."""
        _, info = _route_from_tmap_features([
            _point(200, *A, totalDistance=435),   # totalTime 없음
            _line(A, B, C),
        ])
        assert info.total_distance_meters == 435
        assert info.total_time_seconds == 392     # 435m ÷ (4km/h≈1.111m/s) ≈ 392초 ≈ 약 7분


class TestEstimateWalkingSeconds:
    """도보 시간 추정 — 시속 4km(분당 약 67m, 사용자 지정 실사용 기준)."""

    def test_one_km_takes_15_minutes(self):
        assert route_builder.estimate_walking_seconds(1000) == 900   # 15분

    def test_none_and_zero_return_none(self):
        assert route_builder.estimate_walking_seconds(None) is None
        assert route_builder.estimate_walking_seconds(0) is None

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

    def test_dedupes_identical_visible_labels(self, monkeypatch):
        # 같은 도로/POI 가 좌표만 살짝 달라 여러 줄로 뜨던 '똑같아 보이는 주소'는
        # 화면 라벨(format_place_label) 기준으로 1개만 남긴다(사용자 구분 불가 해소).
        monkeypatch.setattr(route_builder, "_naver_headers", lambda: {"X": "y"})
        payload = {"addresses": [
            {"y": "37.4500", "x": "126.7200", "roadAddress": "인천광역시 남동구 서판로 30"},
            {"y": "37.4501", "x": "126.7201", "roadAddress": "인천광역시 남동구 서판로 30"},
            {"y": "37.4502", "x": "126.7202", "roadAddress": "인천광역시 남동구 서판로 32"},
        ]}
        monkeypatch.setattr(route_builder.requests, "get", lambda *a, **k: _FakeResp(200, payload))
        out = route_builder.geocode_suggestions("서판로30", limit=5)
        labels = [route_builder.format_place_label(d) for _, d in out]
        # '서판로 30'은 1개로 합쳐지고, 건물번호가 다른 '서판로 32'는 별도로 유지된다.
        assert labels.count("남동구 서판로 30") == 1
        assert "남동구 서판로 32" in labels
        assert len(out) == 2

    def test_network_error_returns_empty_gracefully(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_headers", lambda: None)

        def _raise(*a, **k):
            raise route_builder.requests.RequestException("boom")
        monkeypatch.setattr(route_builder.requests, "get", _raise)
        # 예외가 호출부로 전파되지 않고 [] 반환
        assert route_builder.geocode_suggestions("아무거나") == []

    def test_road_number_without_space_retries_with_space(self, monkeypatch):
        # '서판로30'은 addresses 가 비지만 공백 변형 '서판로 30'은 결과가 있어야 뜬다.
        monkeypatch.setattr(route_builder, "_naver_headers", lambda: {"X": "y"})
        seen = []

        def _fake_get(url, params=None, **k):
            seen.append(params["query"])
            if params["query"] == "서판로 30":
                return _FakeResp(200, {"addresses": [
                    {"y": "37.45", "x": "126.72", "roadAddress": "인천 남동구 서판로 30"},
                ]})
            return _FakeResp(200, {"addresses": []})
        monkeypatch.setattr(route_builder.requests, "get", _fake_get)
        out = route_builder.geocode_suggestions("서판로30", limit=5)
        assert seen == ["서판로30", "서판로 30"]  # 원본 먼저, 빈 결과 시 공백 변형 시도
        assert len(out) == 1
        assert out[0][1] == "인천 남동구 서판로 30"


class TestRoadNumberVariants:
    """도로명/지번 주소단위 + 번호가 붙은 검색어의 공백 변형 확장."""

    def test_inserts_space_before_building_number(self):
        assert route_builder._road_number_variants("서판로30") == ["서판로30", "서판로 30"]
        assert route_builder._road_number_variants("강남대로100") == ["강남대로100", "강남대로 100"]

    def test_inserts_space_for_dong_jibun_address(self):
        # 법정동 + 지번을 붙여 쓴 '만수동123'도 '만수동 123'으로 시도 — 지번 주소 검색.
        assert route_builder._road_number_variants("만수동123") == ["만수동123", "만수동 123"]
        assert route_builder._road_number_variants("역삼동825-4") == ["역삼동825-4", "역삼동 825-4"]

    def test_inserts_space_for_units_with_embedded_number(self):
        # 주소단위 토큰이 숫자를 품은 경우도 '끝자리 번호'만 떼어낸다:
        # 번길('테헤란로4길15'), 가('종로1가15'), 행정동 지번('목1동327').
        assert route_builder._road_number_variants("테헤란로4길15") == [
            "테헤란로4길15", "테헤란로4길 15"]
        assert route_builder._road_number_variants("종로1가15") == ["종로1가15", "종로1가 15"]
        assert route_builder._road_number_variants("목1동327") == ["목1동327", "목1동 327"]

    def test_preserves_already_spaced_query(self):
        assert route_builder._road_number_variants("서판로 30") == ["서판로 30"]

    def test_does_not_split_beongil_road_name(self):
        # '서판로30번길'은 그 자체가 도로명 — 번호 뒤에 '번길'이 붙으면 나누지 않는다.
        assert route_builder._road_number_variants("서판로30번길") == ["서판로30번길"]
        assert route_builder._road_number_variants("백범로227번길") == ["백범로227번길"]

    def test_splits_building_number_on_beongil_road(self):
        # 번길 도로명 + 건물번호(붙여쓴 '서판로30번길12')는 건물번호 앞만 띄운다.
        assert route_builder._road_number_variants("서판로30번길12") == [
            "서판로30번길12", "서판로30번길 12"]

    def test_keeps_hyphenated_building_number_together(self):
        assert route_builder._road_number_variants("서판로30-5") == ["서판로30-5", "서판로 30-5"]

    def test_does_not_split_when_no_trailing_number(self):
        # 끝에 붙은 번호가 없으면(행정동 만수3동·동 앞 숫자 성수동2가) 그대로 둔다.
        assert route_builder._road_number_variants("만수3동") == ["만수3동"]
        assert route_builder._road_number_variants("성수동2가") == ["성수동2가"]
        assert route_builder._road_number_variants("행복아파트103동") == ["행복아파트103동"]

    def test_does_not_split_apartment_dong_ho_or_metro_exit(self):
        # 번호 뒤에 한글(호/번출구)이 이어지면 지번이 아니므로 쪼개지 않는다.
        assert route_builder._road_number_variants("래미안103동1502호") == ["래미안103동1502호"]
        assert route_builder._road_number_variants("강남역10번출구") == ["강남역10번출구"]

    def test_non_road_query_unchanged(self):
        assert route_builder._road_number_variants("경복궁") == ["경복궁"]
        assert route_builder._road_number_variants("스타벅스 강남점") == ["스타벅스 강남점"]


class _FakeSecrets:
    def __init__(self, data):
        self._data = data

    def get(self, key, default=None):
        return self._data.get(key, default)


class TestNaverLocalSearch:
    """네이버 지역검색(장소 DB) — 네이버 지도에 뜨는 상호·건물·POI 검색."""

    def test_parse_extracts_wgs84_and_strips_html(self):
        items = [{"title": "<b>경복궁</b>", "roadAddress": "서울 종로구 사직로 161",
                  "address": "서울 종로구 세종로 1-1", "mapx": "1269779400", "mapy": "375759200"}]
        out = route_builder._parse_naver_local_items(items, 5, "q")
        assert len(out) == 1
        coord, display = out[0]
        assert abs(coord.latitude - 37.5759) < 1e-3 and abs(coord.longitude - 126.9779) < 1e-3
        assert display == "서울 종로구 사직로 161 경복궁"  # <b> 제거 + 주소 뒤 상호

    def test_parse_skips_out_of_range_coords(self):
        # KATECH 등 다른 좌표계가 섞이면 /1e7 값이 한국 범위를 벗어난다 → 건너뛴다.
        items = [{"title": "x", "roadAddress": "a", "mapx": "126897", "mapy": "37477"},
                 {"title": "y", "address": "b", "mapx": "0", "mapy": "0"}]
        assert route_builder._parse_naver_local_items(items, 5, "q") == []

    def test_local_hits_no_key_returns_empty_without_network(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_search_headers", lambda: None)

        def _boom(*a, **k):
            raise AssertionError("키 없으면 네트워크 호출 금지")
        monkeypatch.setattr(route_builder.requests, "get", _boom)
        assert route_builder._naver_local_hits("경복궁") == []

    def test_local_hits_parses_response(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_search_headers", lambda: {"X": "y"})
        payload = {"items": [
            {"title": "스타벅스 <b>강남</b>점", "roadAddress": "서울 강남구 테헤란로 101",
             "mapx": "1270276000", "mapy": "374979000"},
        ]}
        monkeypatch.setattr(route_builder.requests, "get", lambda *a, **k: _FakeResp(200, payload))
        out = route_builder._naver_local_hits("스타벅스", 5)
        assert len(out) == 1
        assert out[0][1] == "서울 강남구 테헤란로 101 스타벅스 강남점"

    def test_suggestions_include_naver_local_places(self, monkeypatch):
        # 지오코딩은 주소 전용이라 장소명이 비어도, 지역검색이 장소를 채워 넣는다.
        monkeypatch.setattr(route_builder, "_naver_headers", lambda: None)
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: None)
        monkeypatch.setattr(route_builder, "_naver_search_headers", lambda: {"X": "y"})
        payload = {"items": [
            {"title": "대륭포스트타워<b>8차</b>", "roadAddress": "서울 금천구 가산디지털1로 186",
             "mapx": "1268873000", "mapy": "374766000"},
        ]}
        monkeypatch.setattr(route_builder.requests, "get", lambda *a, **k: _FakeResp(200, payload))
        out = route_builder.geocode_suggestions("대륭포스트타워8차", limit=5)
        assert any("대륭포스트타워8차" in d for _, d in out)


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
        # 한국식 표기: 주소(광역→세부) 뒤에 장소명
        assert display == "서울 종로구 경복궁"

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

    def test_center_requests_distance_sort_nationwide(self, monkeypatch):
        """center(현재 위치)를 주면 거리순(searchtypCd=R)+중심좌표+radius=0(전국)으로 요청 —
        근처 지점을 위로 올리되, radius 를 안 줘 기본 반경에 걸려 먼 장소가 통째로 빠지던
        문제를 막는다. 결과가 있으면 거리순 1회로 끝(정확도순 폴백 없음)."""
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        captured: dict = {}

        def _capture(url, params=None, **k):
            captured.update(params or {})
            return _FakeResp(200, {"searchPoiInfo": {"pois": {"poi": [
                {"name": "카페", "noorLat": "37.55", "noorLon": "126.91"}]}}})

        monkeypatch.setattr(route_builder.requests, "get", _capture)
        center = route_builder.Coordinate(latitude=37.55, longitude=126.91)
        out = route_builder._tmap_poi_results("카페", 5, center=center)
        assert out
        assert captured.get("searchtypCd") == "R"
        assert captured.get("radius") == "0"  # 전국 — 먼 장소도 후보에서 빠지지 않게
        assert str(captured.get("centerLat", "")).startswith("37.55")
        assert str(captured.get("centerLon", "")).startswith("126.91")

    def test_no_center_uses_accuracy_order(self, monkeypatch):
        """center 없으면 정확도순(searchtypCd=A) — 거리/중심좌표 없이 이름 매칭 우선."""
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        captured: dict = {}

        def _capture(url, params=None, **k):
            captured.update(params or {})
            return _FakeResp(200, {"searchPoiInfo": {"pois": {"poi": []}}})

        monkeypatch.setattr(route_builder.requests, "get", _capture)
        route_builder._tmap_poi_results("카페", 5)
        assert captured.get("searchtypCd") == "A"
        assert "centerLat" not in captured
        assert "radius" not in captured

    def test_far_poi_falls_back_to_accuracy_order(self, monkeypatch):
        """근본 수정: 인천에서 검색한 서울 '대륭포스트타워8차'처럼 반경 밖 장소가 거리순
        검색에서 비면, center 없이 정확도순으로 한 번 더 검색해 반드시 뜨게 한다."""
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        calls: list = []

        def _seq(url, params=None, **k):
            calls.append(dict(params or {}))
            if (params or {}).get("searchtypCd") == "R":
                return _FakeResp(200, {"searchPoiInfo": {"pois": {"poi": []}}})  # 반경 밖 → 0건
            return _FakeResp(200, {"searchPoiInfo": {"pois": {"poi": [
                {"name": "대륭포스트타워8차", "noorLat": "37.48", "noorLon": "126.88",
                 "upperAddrName": "서울", "middleAddrName": "금천구"}]}}})

        monkeypatch.setattr(route_builder.requests, "get", _seq)
        center = route_builder.Coordinate(latitude=37.45, longitude=126.72)  # 인천
        out = route_builder._tmap_poi_results("대륭포스트타워8차", 5, center=center)
        assert [d for _, d in out] == ["서울 금천구 대륭포스트타워8차"]
        assert [c.get("searchtypCd") for c in calls] == ["R", "A"]  # 거리순 → 정확도순 폴백

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

    # ── 구조필드 조립(A10 fullAddress 는 행정동·지번·도로명 삼중 연결이라 읽기 불가 —
    #    도로명 하나만, 없으면 지번 하나만 조립하는 실기기 버그 수정분 회귀 고정) ──
    def _reverse_with(self, monkeypatch, address_info):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        monkeypatch.setattr(route_builder.requests, "get",
                            lambda *a, **k: _FakeResp(200, {"addressInfo": address_info}))
        return route_builder._tmap_reverse(self._COORD)

    def test_road_address_assembled_from_structured_fields(self, monkeypatch):
        # 도로명 주소가 있으면 fullAddress(삼중 연결) 대신 도로명 '하나만' 조립
        out = self._reverse_with(monkeypatch, {
            "city_do": "서울특별시", "gu_gun": "마포구",
            "roadName": "어울마당로3길", "buildingIndex": "19",
            "legalDong": "합정동", "bunji": "355-1",
            "fullAddress": "서울특별시 마포구 합정동 서울특별시 마포구 합정동 355-1 어울마당로3길 19",
        })
        assert out == "서울특별시 마포구 어울마당로3길 19"

    def test_building_name_appended_to_road_address(self, monkeypatch):
        out = self._reverse_with(monkeypatch, {
            "city_do": "서울특별시", "gu_gun": "중구",
            "roadName": "세종대로", "buildingIndex": "110", "buildingName": "서울특별시청",
        })
        assert out == "서울특별시 중구 세종대로 110 서울특별시청"

    def test_jibun_fallback_when_road_name_missing(self, monkeypatch):
        # roadName 없음 + 지번 있음 → 지번 주소로 폴백(도로명 미보유 지역).
        # city_do·gu_gun 만으로 road 가 차서 지번 폴백이 죽던 버그의 회귀 고정.
        out = self._reverse_with(monkeypatch, {
            "city_do": "서울특별시", "gu_gun": "마포구",
            "legalDong": "합정동", "bunji": "355-1",
        })
        assert out == "서울특별시 마포구 합정동 355-1"

    def test_partial_fields_do_not_crash_and_fall_back(self, monkeypatch):
        # 구조필드가 광역·구뿐이면 그거라도 반환(빈 문자열/크래시 없음)
        out = self._reverse_with(monkeypatch, {"city_do": "서울특별시", "gu_gun": "마포구"})
        assert out == "서울특별시 마포구"

    def test_non_200_returns_none(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        monkeypatch.setattr(route_builder.requests, "get", lambda *a, **k: _FakeResp(403, {}))
        assert route_builder._tmap_reverse(self._COORD) is None

class TestNaverReverse:
    """Naver Reverse Geocoding — 실사용 1순위 폴백. 행정구역+도로명+번지 조립을 고정."""

    _COORD = Coordinate(latitude=37.5665, longitude=126.9780)

    def _reverse_with(self, monkeypatch, payload, status=200):
        monkeypatch.setattr(route_builder, "_naver_headers", lambda: {"X": "y"})
        monkeypatch.setattr(route_builder.requests, "get",
                            lambda *a, **k: _FakeResp(status, payload))
        return route_builder._naver_reverse(self._COORD)

    def test_no_headers_returns_none_without_network(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_headers", lambda: None)
        def _boom(*a, **k):
            raise AssertionError("키 없으면 네트워크를 호출하면 안 됨")
        monkeypatch.setattr(route_builder.requests, "get", _boom)
        assert route_builder._naver_reverse(self._COORD) is None

    def test_road_address_assembly_with_subnumber(self, monkeypatch):
        # 행정구역 area1~4 + 도로명 + 번지-부번지 조립 (빈 구역은 건너뜀)
        payload = {"results": [{
            "region": {"area1": {"name": "서울특별시"}, "area2": {"name": "마포구"},
                       "area3": {"name": "서교동"}, "area4": {"name": ""}},
            "land": {"name": "양화로", "number1": "45", "number2": "1"},
        }]}
        assert self._reverse_with(monkeypatch, payload) == "서울특별시 마포구 서교동 양화로 45-1"

    def test_number2_absent_keeps_plain_number(self, monkeypatch):
        payload = {"results": [{
            "region": {"area1": {"name": "서울특별시"}, "area2": {"name": "중구"}},
            "land": {"name": "세종대로", "number1": "110"},
        }]}
        assert self._reverse_with(monkeypatch, payload) == "서울특별시 중구 세종대로 110"

    def test_land_missing_returns_region_only(self, monkeypatch):
        # land 가 None(행정동 응답만) — 크래시 없이 행정구역만 반환
        payload = {"results": [{
            "region": {"area1": {"name": "서울특별시"}, "area2": {"name": "마포구"},
                       "area3": {"name": "합정동"}},
            "land": None,
        }]}
        assert self._reverse_with(monkeypatch, payload) == "서울특별시 마포구 합정동"

    def test_empty_results_returns_none(self, monkeypatch):
        assert self._reverse_with(monkeypatch, {"results": []}) is None

    def test_non_200_returns_none(self, monkeypatch):
        # 서비스 미활성(403) 등 — None 폴백(예외 전파 없음)
        assert self._reverse_with(monkeypatch, {}, status=403) is None

    def test_reverse_geocode_uses_naver_first(self, monkeypatch):
        # 폴백 체인 1순위 — Naver 성공 시 TMAP/Nominatim 미호출
        monkeypatch.setattr(route_builder, "_naver_reverse", lambda c: "네이버 주소")
        def _boom(*a, **k):
            raise AssertionError("Naver 성공 시 다음 폴백을 호출하면 안 됨")
        monkeypatch.setattr(route_builder, "_tmap_reverse", _boom)
        monkeypatch.setattr(route_builder.requests, "get", _boom)
        assert route_builder.reverse_geocode(self._COORD) == "네이버 주소"


class TestTmapReverseChain:
    _COORD = Coordinate(latitude=37.5665, longitude=126.9780)

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
        monkeypatch.setattr(route_builder, "_tmap_poi_results",
                            lambda q, limit=5, center=None: [hit])
        def _boom(*a, **k):
            raise AssertionError("POI 성공 시 Nominatim을 호출하면 안 됨")
        monkeypatch.setattr(route_builder.requests, "get", _boom)
        assert route_builder.geocode_suggestions("경복궁") == [hit]

    def test_geocode_address_uses_tmap_poi_when_naver_none(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_geocode", lambda q: None)
        monkeypatch.setattr(route_builder, "_tmap_addr_results", lambda q, limit=1: [])
        hit = (Coordinate(latitude=37.5, longitude=127.0), "경복궁")
        monkeypatch.setattr(route_builder, "_tmap_poi_results", lambda q, limit=1: [hit])
        def _boom(*a, **k):
            raise AssertionError("POI 성공 시 Nominatim을 호출하면 안 됨")
        monkeypatch.setattr(route_builder.requests, "get", _boom)
        assert route_builder.geocode_address("경복궁") == hit


class TestTmapAddrResults:
    """TMAP 주소 지오코딩(fullAddrGeo) — Naver 키 없는 배포 환경의 주소 검색 대체."""

    def test_no_app_key_returns_empty_without_network(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: None)
        def _boom(*a, **k):
            raise AssertionError("앱키 없으면 네트워크를 호출하면 안 됨")
        monkeypatch.setattr(route_builder.requests, "get", _boom)
        assert route_builder._tmap_addr_results("서판로 30") == []

    def test_parses_road_address_from_new_fields(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        payload = {"coordinateInfo": {"coordinate": [{
            "newLat": "37.4500", "newLon": "126.7200",
            "city_do": "인천광역시", "gu_gun": "남동구",
            "newRoadName": "서판로", "newBuildingIndex": "30",
        }]}}
        monkeypatch.setattr(route_builder.requests, "get",
                            lambda *a, **k: _FakeResp(200, payload))
        out = route_builder._tmap_addr_results("서판로 30")
        assert len(out) == 1
        coord, display = out[0]
        assert display == "인천광역시 남동구 서판로 30"
        assert abs(coord.latitude - 37.45) < 1e-6
        assert abs(coord.longitude - 126.72) < 1e-6

    def test_jibun_fallback_when_no_road_name(self, monkeypatch):
        # 도로명 미보유 주소지 — city_do·gu_gun 만으로 도로명이 조립돼 지번 폴백이
        # 죽지 않아야 한다(_tmap_reverse 지번 유실 수정과 같은 원칙의 정방향 가드).
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        payload = {"coordinateInfo": {"coordinate": [{
            "lat": "37.5495", "lon": "126.9137",
            "city_do": "서울특별시", "gu_gun": "마포구",
            "legalDong": "합정동", "bunji": "355-1",
        }]}}
        monkeypatch.setattr(route_builder.requests, "get",
                            lambda *a, **k: _FakeResp(200, payload))
        out = route_builder._tmap_addr_results("합정동 355-1")
        assert out[0][1] == "서울특별시 마포구 합정동 355-1"

    def test_rural_eup_myun_ri_preserved(self, monkeypatch):
        # 읍·면·리 시골 지번 주소가 동 단위로 뭉개지지 않아야 한다.
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        payload = {"coordinateInfo": {"coordinate": [{
            "lat": "34.9900", "lon": "126.4800",
            "city_do": "전라남도", "gu_gun": "무안군",
            "eup_myun": "삼향읍", "ri": "남악리", "bunji": "100",
        }]}}
        monkeypatch.setattr(route_builder.requests, "get",
                            lambda *a, **k: _FakeResp(200, payload))
        out = route_builder._tmap_addr_results("남악리 100")
        assert out[0][1] == "전라남도 무안군 삼향읍 남악리 100"

    def test_retries_spaced_variant_when_original_empty(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        seen = []

        def _fake_get(url, params=None, **k):
            seen.append(params["fullAddr"])
            if params["fullAddr"] == "서판로 30":
                return _FakeResp(200, {"coordinateInfo": {"coordinate": [{
                    "newLat": "37.45", "newLon": "126.72",
                    "city_do": "인천광역시", "gu_gun": "남동구",
                    "newRoadName": "서판로", "newBuildingIndex": "30"}]}})
            return _FakeResp(200, {"coordinateInfo": {"coordinate": []}})
        monkeypatch.setattr(route_builder.requests, "get", _fake_get)
        out = route_builder._tmap_addr_results("서판로30")
        assert seen == ["서판로30", "서판로 30"]  # 원본 먼저, 빈 결과 시 공백 변형
        assert len(out) == 1

    def test_network_error_returns_empty(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")

        def _raise(*a, **k):
            raise route_builder.requests.RequestException("boom")
        monkeypatch.setattr(route_builder.requests, "get", _raise)
        assert route_builder._tmap_addr_results("서판로 30") == []

    def test_non_list_coordinate_payload_returns_empty(self, monkeypatch):
        # 규격 밖 응답: coordinate 가 배열이 아니라 단일 dict 로 와도
        # 예외 전파 없이 [] (예외 미전파 계약 — 검색창이 죽지 않아야 한다).
        monkeypatch.setattr(route_builder, "_tmap_app_key", lambda: "k")
        payload = {"coordinateInfo": {"coordinate": {"lat": "37.5", "lon": "127.0"}}}
        monkeypatch.setattr(route_builder.requests, "get",
                            lambda *a, **k: _FakeResp(200, payload))
        assert route_builder._tmap_addr_results("서판로 30") == []


class TestAddrGeoFallbackChain:
    """주소 소스 폴백·병합 — Naver 키 없이도 주소지가 뜨고, 주소·POI 가 함께 뜬다."""

    def test_suggestions_use_tmap_addr_when_naver_keyless(self, monkeypatch):
        # 배포 환경 재현: Naver 키 없음 → fullAddrGeo 가 주소 후보를 채우고
        # POI 는 뒤에 보충된다(주소 후보가 먼저).
        monkeypatch.setattr(route_builder, "_naver_headers", lambda: None)
        addr_hit = (Coordinate(latitude=37.45, longitude=126.72),
                    "인천광역시 남동구 서판로 30")
        poi_hit = (Coordinate(latitude=37.46, longitude=126.73),
                   "인천광역시 남동구 만수동 어느건물")
        monkeypatch.setattr(route_builder, "_tmap_addr_results",
                            lambda q, limit=5: [addr_hit])
        monkeypatch.setattr(route_builder, "_tmap_poi_results",
                            lambda q, limit=5, center=None: [poi_hit])

        def _boom(*a, **k):
            raise AssertionError("주소·POI 성공 시 Nominatim을 호출하면 안 됨")
        monkeypatch.setattr(route_builder.requests, "get", _boom)
        out = route_builder.geocode_suggestions("서판로 30")
        assert out[0] == addr_hit
        assert poi_hit in out

    def test_suggestions_supplement_poi_even_when_naver_has_results(self, monkeypatch):
        # 양자택일(주소가 1건이라도 있으면 POI 통째 생략) 제거 가드 —
        # 주소 후보와 건물·장소 후보가 한 목록에 함께 떠야 한다.
        monkeypatch.setattr(route_builder, "_naver_headers", lambda: {"X": "y"})
        payload = {"addresses": [
            {"y": "37.5759", "x": "126.9769", "roadAddress": "서울 종로구 사직로 161"},
        ]}
        monkeypatch.setattr(route_builder.requests, "get",
                            lambda *a, **k: _FakeResp(200, payload))
        poi_hit = (Coordinate(latitude=37.58, longitude=126.98),
                   "서울 종로구 세종로 경복궁")
        monkeypatch.setattr(route_builder, "_tmap_poi_results",
                            lambda q, limit=5, center=None: [poi_hit])
        out = route_builder.geocode_suggestions("경복궁", limit=5)
        assert "서울 종로구 사직로 161" in [d for _, d in out]
        assert poi_hit in out

    def test_geocode_address_uses_tmap_addr_before_poi(self, monkeypatch):
        monkeypatch.setattr(route_builder, "_naver_geocode", lambda q: None)
        hit = (Coordinate(latitude=37.45, longitude=126.72),
               "인천광역시 남동구 서판로 30")
        monkeypatch.setattr(route_builder, "_tmap_addr_results",
                            lambda q, limit=1: [hit])

        def _poi_boom(*a, **k):
            raise AssertionError("주소 지오코딩 성공 시 POI 를 호출하면 안 됨")
        monkeypatch.setattr(route_builder, "_tmap_poi_results", _poi_boom)
        assert route_builder.geocode_address("서판로 30") == hit


class TestSuggestionsParallel:
    """검색 소스 병렬화 — 직렬 폴백 체인의 지연 합산('도착지 검색 느림') 제거 가드."""

    def test_sources_fetched_concurrently(self, monkeypatch):
        # 세 소스가 각 0.25초 걸려도 전체는 1회분(<0.6초)이어야 한다(직렬이면 ≥0.75초).
        import time as _t

        def _slow(ret):
            def _f(*a, **k):
                _t.sleep(0.25)
                return ret
            return _f
        addr_hit = (Coordinate(latitude=37.1, longitude=127.1), "주소 후보")
        poi_hit = (Coordinate(latitude=37.2, longitude=127.2), "장소 후보")
        monkeypatch.setattr(route_builder, "_naver_suggestion_hits", _slow([addr_hit]))
        monkeypatch.setattr(route_builder, "_tmap_addr_results", _slow([]))
        monkeypatch.setattr(route_builder, "_tmap_poi_results", _slow([poi_hit]))
        t0 = _t.perf_counter()
        out = route_builder.geocode_suggestions("아무거나", limit=5)
        elapsed = _t.perf_counter() - t0
        assert elapsed < 0.6, f"병렬화 안 됨(직렬 의심): {elapsed:.2f}s"
        assert out[0] == addr_hit   # 주소 후보가 먼저
        assert poi_hit in out       # POI 보충 유지

    def test_naver_hits_take_priority_over_addr_geo(self, monkeypatch):
        # 병렬 투기 호출이어도 병합 우선순위는 직렬 때와 동일: Naver 있으면 fullAddrGeo 폐기.
        naver_hit = (Coordinate(latitude=37.1, longitude=127.1), "네이버 주소")
        addr_hit = (Coordinate(latitude=37.2, longitude=127.2), "TMAP 주소")
        monkeypatch.setattr(route_builder, "_naver_suggestion_hits",
                            lambda q, limit: [naver_hit])
        monkeypatch.setattr(route_builder, "_tmap_addr_results",
                            lambda q, limit=5: [addr_hit])
        monkeypatch.setattr(route_builder, "_tmap_poi_results",
                            lambda q, limit=5, center=None: [])
        out = route_builder.geocode_suggestions("주소", limit=5)
        assert naver_hit in out
        assert addr_hit not in out

    def test_source_exception_degrades_to_empty(self, monkeypatch):
        # 한 소스가 예외로 죽어도 전체 제안은 계속(예외 미전파 계약 — _future_result).
        def _boom(*a, **k):
            raise RuntimeError("source down")
        poi_hit = (Coordinate(latitude=37.2, longitude=127.2), "장소 후보")
        monkeypatch.setattr(route_builder, "_naver_suggestion_hits", _boom)
        monkeypatch.setattr(route_builder, "_tmap_addr_results", _boom)
        monkeypatch.setattr(route_builder, "_tmap_poi_results",
                            lambda q, limit=5, center=None: [poi_hit])
        assert poi_hit in route_builder.geocode_suggestions("아무거나", limit=5)
