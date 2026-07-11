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
