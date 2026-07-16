import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import transit_builder
from engine import Coordinate, RouteModel
from route_builder import RouteInfo


ORIGIN = Coordinate(latitude=37.5665, longitude=126.9780)
DEST = Coordinate(latitude=37.5700, longitude=126.9820)
MID = Coordinate(latitude=37.5680, longitude=126.9800)


def _dummy_route(start=ORIGIN, end=DEST):
    return RouteModel(polyline=(start, end), turn_points=())


def _tmap_payload():
    return {
        "metaData": {
            "plan": {
                "itineraries": [{
                    "totalDistance": 2500,
                    "totalTime": 1200,
                    "legs": [
                        {
                            "mode": "WALK",
                            "start": {"name": "출발", "lat": 37.5665, "lon": 126.9780},
                            "end": {"name": "시청역", "lat": 37.5650, "lon": 126.9770},
                            "distance": 300,
                            "sectionTime": 240,
                        },
                        {
                            "mode": "SUBWAY",
                            "route": "2호선",
                            "start": {"name": "시청역", "lat": 37.5650, "lon": 126.9770},
                            "end": {"name": "을지로입구역", "lat": 37.5660, "lon": 126.9820},
                            "stationCount": 1,
                            "distance": 1500,
                            "sectionTime": 420,
                            "points": [[126.9770, 37.5650], [126.9820, 37.5660]],
                        },
                        {
                            "mode": "WALK",
                            "start": {"name": "을지로입구역", "lat": 37.5660, "lon": 126.9820},
                            "end": {"name": "도착", "lat": 37.5700, "lon": 126.9820},
                            "distance": 700,
                            "sectionTime": 540,
                        },
                    ],
                }]
            }
        }
    }


def _odsay_payload():
    return {
        "result": {
            "path": [{
                "info": {"totalDistance": 3300, "totalTime": 18},
                "subPath": [
                    {
                        "trafficType": 3,
                        "startName": "출발",
                        "endName": "합정역",
                        "startX": 126.9780,
                        "startY": 37.5665,
                        "endX": 126.9800,
                        "endY": 37.5680,
                        "distance": 400,
                        "sectionTime": 5,
                    },
                    {
                        "trafficType": 2,
                        "lane": [{"busNo": "7011"}],
                        "startName": "합정역",
                        "endName": "홍대입구",
                        "startX": 126.9800,
                        "startY": 37.5680,
                        "endX": 126.9820,
                        "endY": 37.5700,
                        "stationCount": 3,
                        "distance": 2500,
                        "sectionTime": 10,
                    },
                    {
                        "trafficType": 3,
                        "startName": "홍대입구",
                        "endName": "도착",
                        "startX": 126.9820,
                        "startY": 37.5700,
                        "endX": 126.9830,
                        "endY": 37.5710,
                        "distance": 400,
                        "sectionTime": 3,
                    },
                ],
            }]
        }
    }


class TestParseTmapTransit:
    def test_parses_leg_order_and_transit_metadata(self):
        journey = transit_builder.parse_tmap_transit(_tmap_payload())

        assert journey.source == "TMAP 대중교통"
        assert journey.total_distance_meters == 2500
        assert journey.total_time_seconds == 1200
        assert [leg.mode for leg in journey.legs] == ["walk", "subway", "walk"]

        subway = journey.legs[1]
        assert subway.transit is not None
        assert subway.transit.line_name == "2호선"
        assert subway.transit.board_station == "시청역"
        assert subway.transit.alight_station == "을지로입구역"
        assert subway.transit.station_count == 1
        assert subway.transit.display_polyline == (
            Coordinate(latitude=37.5650, longitude=126.9770),
            Coordinate(latitude=37.5660, longitude=126.9820),
        )

    def test_missing_itinerary_raises(self):
        with pytest.raises(ValueError):
            transit_builder.parse_tmap_transit({"metaData": {"plan": {"itineraries": []}}})


class TestParseOdsayTransit:
    def test_parses_odsay_minutes_as_seconds(self):
        journey = transit_builder.parse_odsay_transit(_odsay_payload())

        assert journey.source == "ODsay"
        assert journey.total_distance_meters == 3300
        assert journey.total_time_seconds == 18 * 60
        assert [leg.mode for leg in journey.legs] == ["walk", "bus", "walk"]

        bus = journey.legs[1]
        assert bus.transit is not None
        assert bus.transit.line_name == "7011"
        assert bus.transit.time_seconds == 10 * 60
        assert bus.transit.station_count == 3

    def test_missing_path_raises(self):
        with pytest.raises(ValueError):
            transit_builder.parse_odsay_transit({"result": {"path": []}})


class TestHydrateWalkLegs:
    def test_hydrates_walk_legs_only(self, monkeypatch):
        journey = transit_builder.parse_tmap_transit(_tmap_payload())

        def fake_fetch(start, end):
            return _dummy_route(start, end), "fake-walk", RouteInfo(100, 60)

        monkeypatch.setattr(transit_builder, "fetch_walking_route_with_engine", fake_fetch)
        hydrated = transit_builder._hydrate_walk_legs(journey)

        assert hydrated.legs[0].tracked is True
        assert hydrated.legs[0].route is not None
        assert hydrated.legs[0].walk_engine_label == "fake-walk"
        assert hydrated.legs[1].tracked is False
        assert hydrated.legs[1].route is None
        assert hydrated.legs[2].tracked is True

    def test_hydration_failure_keeps_walk_untracked_without_straight_route(self, monkeypatch):
        journey = transit_builder.build_walking_only_journey(ORIGIN, DEST)

        def fail_fetch(start, end):
            raise ValueError("route unavailable")

        monkeypatch.setattr(transit_builder, "fetch_walking_route_with_engine", fail_fetch)
        hydrated = transit_builder._hydrate_walk_legs(journey)

        assert hydrated.legs[0].tracked is False
        assert hydrated.legs[0].route is None


class TestFetchTransitJourneyFallback:
    def test_uses_tmap_first_when_key_present(self, monkeypatch):
        monkeypatch.setattr(transit_builder.route_builder, "_tmap_app_key", lambda: "tmap-key")
        monkeypatch.setattr(transit_builder, "_fetch_tmap_transit_raw", lambda origin, dest, key: _tmap_payload())
        monkeypatch.setattr(transit_builder, "_odsay_api_key", lambda: None)
        monkeypatch.setattr(
            transit_builder,
            "fetch_walking_route_with_engine",
            lambda start, end: (_dummy_route(start, end), "fake-walk", RouteInfo(100, 60)),
        )

        journey = transit_builder.fetch_transit_journey(ORIGIN, DEST)

        assert journey.source == "TMAP 대중교통"
        assert [leg.mode for leg in journey.legs] == ["walk", "subway", "walk"]

    def test_falls_back_to_odsay_when_tmap_fails(self, monkeypatch):
        monkeypatch.setattr(transit_builder.route_builder, "_tmap_app_key", lambda: "tmap-key")
        monkeypatch.setattr(transit_builder, "_fetch_tmap_transit_raw", lambda origin, dest, key: (_ for _ in ()).throw(ValueError("boom")))
        monkeypatch.setattr(transit_builder, "_odsay_api_key", lambda: "odsay-key")
        monkeypatch.setattr(transit_builder, "_fetch_odsay_transit_raw", lambda origin, dest, key: _odsay_payload())
        monkeypatch.setattr(
            transit_builder,
            "fetch_walking_route_with_engine",
            lambda start, end: (_dummy_route(start, end), "fake-walk", RouteInfo(100, 60)),
        )

        journey = transit_builder.fetch_transit_journey(ORIGIN, DEST)

        assert journey.source == "ODsay"
        assert [leg.mode for leg in journey.legs] == ["walk", "bus", "walk"]

    def test_no_keys_returns_walking_only_journey(self, monkeypatch):
        monkeypatch.setattr(transit_builder.route_builder, "_tmap_app_key", lambda: None)
        monkeypatch.setattr(transit_builder, "_odsay_api_key", lambda: None)
        monkeypatch.setattr(
            transit_builder,
            "fetch_walking_route_with_engine",
            lambda start, end: (_dummy_route(start, end), "fake-walk", RouteInfo(100, 60)),
        )

        journey = transit_builder.fetch_transit_journey(ORIGIN, DEST)

        assert journey.source == transit_builder.DOWNGRADE_NO_KEY
        assert len(journey.legs) == 1
        assert journey.legs[0].mode == "walk"
        assert journey.legs[0].tracked is True

    def test_key_present_but_call_fails_reports_failure_not_missing_key(self, monkeypatch):
        # 키가 있는데 호출·파싱이 실패해 강등된 경우 '키 없음'이라고 안내하면 오해를 준다.
        monkeypatch.setattr(transit_builder.route_builder, "_tmap_app_key", lambda: None)
        monkeypatch.setattr(transit_builder, "_odsay_api_key", lambda: "odsay-key")
        monkeypatch.setattr(
            transit_builder, "_fetch_odsay_transit_raw",
            lambda origin, dest, key: (_ for _ in ()).throw(ValueError("boom")))
        monkeypatch.setattr(
            transit_builder, "fetch_walking_route_with_engine",
            lambda start, end: (_dummy_route(start, end), "fake-walk", RouteInfo(100, 60)))

        journey = transit_builder.fetch_transit_journey(ORIGIN, DEST)

        assert journey.source == transit_builder.DOWNGRADE_FAILED
        assert journey.source.startswith("도보 강등")  # UI 안내 조건은 그대로 성립
        assert "키 없음" not in journey.source


def _odsay_payload_walk_without_coords() -> dict:
    """실제 ODsay 형식 — 도보(trafficType=3) 구간엔 좌표가 없고 지하철에만 있다."""
    return {"result": {"path": [{
        "info": {"totalDistance": 3000, "totalTime": 30},
        "subPath": [
            {"trafficType": 3, "distance": 200, "sectionTime": 3},  # 출발지→역 도보(좌표 없음)
            {"trafficType": 1, "sectionTime": 20, "stationCount": 5,
             "startX": 127.02, "startY": 37.50, "endX": 127.06, "endY": 37.52,
             "startName": "강남", "endName": "잠실", "lane": [{"name": "2호선"}]},
            {"trafficType": 3, "distance": 150, "sectionTime": 2},  # 역→목적지 도보(좌표 없음)
        ],
    }]}}


class TestOdsayWalkLegCoordinateInterpolation:
    """실제 ODsay 응답의 좌표 없는 도보 구간 — 인접·양끝 좌표로 보간해야 파싱된다."""

    def test_walk_legs_without_coords_are_interpolated(self):
        journey = transit_builder.parse_odsay_transit(
            _odsay_payload_walk_without_coords(), origin=ORIGIN, dest=DEST)

        assert [leg.mode for leg in journey.legs] == ["walk", "subway", "walk"]
        # 첫 도보: 출발지 → 지하철 승차역 좌표
        assert journey.legs[0].start == ORIGIN
        assert journey.legs[0].end == journey.legs[1].start
        # 마지막 도보: 지하철 하차역 좌표 → 목적지
        assert journey.legs[2].start == journey.legs[1].end
        assert journey.legs[2].end == DEST

    def test_odsay_fallback_now_yields_transit_legs_end_to_end(self, monkeypatch):
        # 이 버그 이전에는 실제 형식 응답이 항상 예외 → 도보 강등되어 ODsay 폴백이 죽어 있었다.
        monkeypatch.setattr(transit_builder.route_builder, "_tmap_app_key", lambda: None)
        monkeypatch.setattr(transit_builder, "_odsay_api_key", lambda: "odsay-key")
        monkeypatch.setattr(
            transit_builder, "_fetch_odsay_transit_raw",
            lambda origin, dest, key: _odsay_payload_walk_without_coords())
        monkeypatch.setattr(
            transit_builder, "fetch_walking_route_with_engine",
            lambda start, end: (_dummy_route(start, end), "fake-walk", RouteInfo(100, 60)))

        journey = transit_builder.fetch_transit_journey(ORIGIN, DEST)

        assert journey.source == "ODsay"
        assert any(leg.mode == "subway" for leg in journey.legs)

    def test_still_raises_when_no_coords_and_no_origin_dest(self):
        # origin/dest 를 못 주면(직접 파서 호출) 기존처럼 엄격하게 실패한다.
        with pytest.raises(ValueError):
            transit_builder.parse_odsay_transit(_odsay_payload_walk_without_coords())

    def test_consecutive_coordless_walk_legs_still_resolve(self):
        # 좌표 없는 도보 구간이 연속으로 오면 '다음 start ↔ 이전 end' 상호참조가
        # 수렴하지 않는다 → 뒤쪽에서 처음 알려진 좌표를 내다보는 방식이어야 한다.
        payload = {"result": {"path": [{
            "info": {"totalDistance": 3000, "totalTime": 30},
            "subPath": [
                {"trafficType": 3, "distance": 100, "sectionTime": 2},   # 도보(좌표 없음)
                {"trafficType": 3, "distance": 100, "sectionTime": 2},   # 도보(좌표 없음) — 연속
                {"trafficType": 1, "sectionTime": 20, "stationCount": 5,
                 "startX": 127.02, "startY": 37.50, "endX": 127.06, "endY": 37.52,
                 "startName": "강남", "endName": "잠실", "lane": [{"name": "2호선"}]},
            ],
        }]}}
        journey = transit_builder.parse_odsay_transit(payload, origin=ORIGIN, dest=DEST)

        # 도보 강등되지 않고 지하철 구간이 살아 있어야 한다(이게 이 수정의 목적).
        assert [leg.mode for leg in journey.legs] == ["walk", "walk", "subway"]
        assert journey.legs[0].start == ORIGIN
        # 두 도보 구간 모두 좌표가 채워져 예외 없이 파싱된다.
        assert all(leg.start is not None and leg.end is not None for leg in journey.legs)


class TestParserFallbackBranches:
    """파서 폴백 분기 회귀(야간 점검) — 실응답 변형이 와도 여정이 죽지 않게 고정."""

    def test_rail_maps_to_subway_and_unknown_mode_to_transfer(self):
        # plan 없이 최상위 itineraries 만 있는 변형 + RAIL/미상(TRAM) mode 분류
        payload = {"itineraries": [{"legs": [
            {"mode": "TRAM",
             "start": {"name": "A", "lat": 37.1, "lon": 127.1},
             "end": {"name": "B", "lat": 37.2, "lon": 127.2}},
            {"mode": "RAIL", "route": "경의중앙선",
             "start": {"name": "B", "lat": 37.2, "lon": 127.2},
             "end": {"name": "C", "lat": 37.3, "lon": 127.3}},
        ]}]}
        journey = transit_builder.parse_tmap_transit(payload)

        assert [leg.mode for leg in journey.legs] == ["transfer", "subway"]
        assert journey.legs[0].transit is None  # transfer 는 대중교통 카드 메타 없음
        assert journey.legs[1].transit.line_name == "경의중앙선"

    def test_leg_level_prefixed_coords_are_parsed(self):
        # start/end dict 없이 leg 레벨 startX/startY 만 주는 변형도 좌표를 읽는다
        payload = {"itineraries": [{"legs": [
            {"mode": "WALK", "startName": "출발지", "endName": "역",
             "startX": 126.97, "startY": 37.56, "endX": 126.98, "endY": 37.57},
        ]}]}
        journey = transit_builder.parse_tmap_transit(payload)

        leg = journey.legs[0]
        assert leg.start == Coordinate(latitude=37.56, longitude=126.97)
        assert leg.end == Coordinate(latitude=37.57, longitude=126.98)
        assert leg.start_label == "출발지"

    def test_missing_coordinates_raise(self):
        payload = {"itineraries": [{"legs": [{"mode": "WALK", "startName": "출발"}]}]}
        with pytest.raises(ValueError):
            transit_builder.parse_tmap_transit(payload)

    def test_empty_legs_raise(self):
        payload = {"itineraries": [{"legs": []}]}
        with pytest.raises(ValueError):
            transit_builder.parse_tmap_transit(payload)

    def test_line_name_defaults_and_station_count_from_stop_list(self):
        def leg(mode):
            return {"mode": mode,
                    "start": {"name": "A", "lat": 37.1, "lon": 127.1},
                    "end": {"name": "B", "lat": 37.2, "lon": 127.2},
                    "passStopList": {"stationList": [{}, {}, {}]}}

        payload = {"itineraries": [{"legs": [leg("SUBWAY"), leg("BUS")]}]}
        journey = transit_builder.parse_tmap_transit(payload)

        # 노선명 미제공 → 모드별 한국어 기본값
        assert journey.legs[0].transit.line_name == "지하철"
        assert journey.legs[1].transit.line_name == "버스"
        # stationCount 미제공 → 정차역 목록 길이로 유도
        assert journey.legs[0].transit.station_count == 3

    def test_odsay_unknown_traffic_type_is_transfer(self):
        payload = _odsay_payload()
        payload["result"]["path"][0]["subPath"][1]["trafficType"] = 9
        journey = transit_builder.parse_odsay_transit(payload)

        assert journey.legs[1].mode == "transfer"
        assert journey.legs[1].transit is None


class TestSmallHelpers:
    def test_line_name_from_lane_variants(self):
        f = transit_builder._line_name_from_lane
        assert f([{"name": "2호선"}]) == "2호선"
        assert f([{"busNo": "7011"}]) == "7011"
        assert f({"name": "9호선"}) == "9호선"   # list 아닌 dict 단독 형태
        assert f(["간선"]) == "간선"             # dict 아닌 스칼라 목록
        assert f(None) == "대중교통"
        assert f([]) == "대중교통"

    def test_as_int_boundaries(self):
        f = transit_builder._as_int
        assert f(None) is None
        assert f("") is None
        assert f("abc") is None
        assert f("12.7") == 12
        assert f(3.9) == 3

    def test_polyline_from_any_skips_junk(self):
        f = transit_builder._polyline_from_any
        assert f(None) == ()
        assert f("not-a-list") == ()
        # float 불가 항목·길이 부족 항목은 건너뛰고 유효 좌표만 수집
        pts = f([[126.97, 37.56], ["x", "y"], {"lat": 37.57, "lon": 126.98}, [1.0]])
        assert pts == (
            Coordinate(latitude=37.56, longitude=126.97),
            Coordinate(latitude=37.57, longitude=126.98),
        )


class TestHydrateTotals:
    def test_single_leg_journey_totals_updated_from_route_info(self, monkeypatch):
        # 도보 단독 여정은 하이드레이션된 실경로의 거리·시간으로 총계를 채운다
        journey = transit_builder.build_walking_only_journey(ORIGIN, DEST)
        monkeypatch.setattr(
            transit_builder, "fetch_walking_route_with_engine",
            lambda s, e: (_dummy_route(s, e), "fake", RouteInfo(1234, 900)))

        hydrated = transit_builder._hydrate_walk_legs(journey)

        assert hydrated.total_distance_meters == 1234
        assert hydrated.total_time_seconds == 900

    def test_multi_leg_journey_keeps_provider_totals(self, monkeypatch):
        # 다구간 여정은 도보 구간을 하이드레이션해도 제공자 총계(전 구간 합)를 보존한다
        journey = transit_builder.parse_tmap_transit(_tmap_payload())
        monkeypatch.setattr(
            transit_builder, "fetch_walking_route_with_engine",
            lambda s, e: (_dummy_route(s, e), "fake", RouteInfo(1, 1)))

        hydrated = transit_builder._hydrate_walk_legs(journey)

        assert hydrated.total_distance_meters == 2500
        assert hydrated.total_time_seconds == 1200


class TestAdvanceLeg:
    def test_tracked_walk_near_end_advances_when_not_last(self):
        first = transit_builder.JourneyLeg(
            mode="walk",
            start=ORIGIN,
            end=MID,
            start_label="출발",
            end_label="중간",
            tracked=True,
            route=_dummy_route(ORIGIN, MID),
        )
        second = transit_builder.JourneyLeg(mode="bus", start=MID, end=DEST, start_label="중간", end_label="도착")
        journey = transit_builder.Journey(legs=(first, second), source="test")

        assert transit_builder.advance_leg(journey, 0, MID, 10.0) == 1

    def test_last_leg_does_not_advance(self):
        leg = transit_builder.JourneyLeg(
            mode="walk",
            start=ORIGIN,
            end=DEST,
            start_label="출발",
            end_label="도착",
            tracked=True,
            route=_dummy_route(),
        )
        journey = transit_builder.Journey(legs=(leg,), source="test")

        assert transit_builder.advance_leg(journey, 0, DEST, 10.0) == 0

    def test_transit_leg_never_auto_advances(self):
        first = transit_builder.JourneyLeg(mode="bus", start=ORIGIN, end=MID, start_label="출발", end_label="중간")
        second = transit_builder.JourneyLeg(mode="walk", start=MID, end=DEST, start_label="중간", end_label="도착")
        journey = transit_builder.Journey(legs=(first, second), source="test")

        assert transit_builder.advance_leg(journey, 0, MID, 10.0) == 0

    def test_poor_accuracy_blocks_arrival_advance(self):
        first = transit_builder.JourneyLeg(
            mode="walk",
            start=ORIGIN,
            end=MID,
            start_label="출발",
            end_label="중간",
            tracked=True,
            route=_dummy_route(ORIGIN, MID),
        )
        second = transit_builder.JourneyLeg(mode="walk", start=MID, end=DEST, start_label="중간", end_label="도착")
        journey = transit_builder.Journey(legs=(first, second), source="test")

        assert transit_builder.advance_leg(journey, 0, MID, 80.0) == 0

    def test_negative_index_returns_unchanged(self):
        # 음수 인덱스는 방어적으로 그대로 반환(범위 밖 접근 크래시 방지)
        leg = transit_builder.JourneyLeg(
            mode="walk", start=ORIGIN, end=MID, start_label="출발", end_label="중간",
            tracked=True, route=_dummy_route(ORIGIN, MID),
        )
        journey = transit_builder.Journey(legs=(leg,), source="test")

        assert transit_builder.advance_leg(journey, -1, MID, 10.0) == -1

    def test_out_of_range_index_returns_unchanged(self):
        # legs 길이를 넘는 인덱스도 그대로 반환(IndexError 방지)
        leg = transit_builder.JourneyLeg(
            mode="walk", start=ORIGIN, end=MID, start_label="출발", end_label="중간",
            tracked=True, route=_dummy_route(ORIGIN, MID),
        )
        journey = transit_builder.Journey(legs=(leg,), source="test")

        assert transit_builder.advance_leg(journey, 5, MID, 10.0) == 5

    def test_untracked_walk_leg_does_not_advance(self):
        # 하이드레이션 실패로 tracked=False 된 도보 레그는 도착 거리·양호 정확도라도
        # 자동 전진하지 않는다(추적 안 되는 구간은 이탈/도착을 신뢰할 수 없음).
        first = transit_builder.JourneyLeg(
            mode="walk", start=ORIGIN, end=MID, start_label="출발", end_label="중간",
            tracked=False,
        )
        second = transit_builder.JourneyLeg(mode="walk", start=MID, end=DEST, start_label="중간", end_label="도착")
        journey = transit_builder.Journey(legs=(first, second), source="test")

        assert transit_builder.advance_leg(journey, 0, MID, 10.0) == 0
