# -*- coding: utf-8 -*-
"""landmark_harvest — 회전점 주변 랜드마크 후보 자동 수집(반자동 ③안) 검증.

네트워크는 주입한 가짜 검색 함수로 대체해 순수 로직만 고정한다.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import Coordinate, LocalPoint, RouteModel, TurnPoint, project_from_local_meters
from landmark_harvest import (
    AUTO_SOURCE,
    MAX_ROUTE_DISTANCE_M,
    MAX_TURN_DISTANCE_M,
    harvest_candidates,
)
from landmarks import is_non_field_source, landmark_completeness

ORIGIN = Coordinate(latitude=37.5665, longitude=126.978)


def move(east: float, north: float) -> Coordinate:
    return project_from_local_meters(ORIGIN, LocalPoint(east_meters=east, north_meters=north))


def turn_route() -> RouteModel:
    """동쪽으로 40m 간 뒤 북쪽으로 꺾이는 경로 — 회전점 1개."""
    return RouteModel(
        polyline=(ORIGIN, move(40, 0), move(40, 40)),
        turn_points=(
            TurnPoint(id="t1", coordinate=move(40, 0), route_index=1, direction="left"),
        ),
    )


def fake_search(results_by_keyword: dict):
    """키워드별 고정 응답을 돌려주는 가짜 검색."""
    def _search(center, keyword, limit):
        return results_by_keyword.get(keyword, [])[:limit]
    return _search


class TestHarvest:
    def test_collects_nearby_poi_as_draft_candidate(self):
        found = harvest_candidates(
            turn_route(),
            fake_search({"편의점": [(move(45, 5), "서울 중구 태평로 CU시청점")]}),
        )

        assert len(found) == 1
        lm = found[0]
        assert lm.name == "CU시청점"          # 주소 접두어는 떼고 상호만
        assert lm.category == "convenience_store"
        assert lm.status == "draft"           # 자동 수집분은 절대 approved 가 아니다

    def test_auto_source_blocks_approval(self):
        found = harvest_candidates(
            turn_route(), fake_search({"편의점": [(move(45, 5), "CU시청점")]}))

        assert found[0].source == AUTO_SOURCE
        assert is_non_field_source(found[0].source)
        report = landmark_completeness(found[0])
        assert report["ready_for_approval"] is False   # 현장 확인 전 승인 불가
        assert report["non_field_source"] is True
        # 현장에서 채워야 할 항목이 명시된다
        assert "visible_from_degrees" in report["missing"]

    def test_drops_poi_far_from_turn_point(self):
        far = move(40 + MAX_TURN_DISTANCE_M + 20, 0)
        found = harvest_candidates(turn_route(), fake_search({"편의점": [(far, "먼편의점")]}))

        assert found == []

    def test_drops_poi_far_from_route_line(self):
        # 회전점에서는 가깝지만 경로선에서 멀리 떨어진 건물(길 안쪽) — 기준점으로 부적합
        aside = move(40, -(MAX_ROUTE_DISTANCE_M + 15))
        found = harvest_candidates(turn_route(), fake_search({"편의점": [(aside, "안쪽상가")]}))

        assert found == []

    def test_skips_straight_turn_points(self):
        route = RouteModel(
            polyline=(ORIGIN, move(40, 0), move(80, 0)),
            turn_points=(
                TurnPoint(id="s1", coordinate=move(40, 0), route_index=1,
                          direction="straight"),
            ),
        )
        found = harvest_candidates(route, fake_search({"편의점": [(move(42, 3), "CU")]}))

        assert found == []   # 직진 지점에는 기준점이 필요 없다

    def test_dedupes_same_place_across_keywords(self):
        same = move(44, 4)
        found = harvest_candidates(turn_route(), fake_search({
            "편의점": [(same, "CU시청점")],
            "약국": [(same, "CU시청점")],
        }))

        assert len(found) == 1

    def test_skips_already_known_ids(self):
        first = harvest_candidates(turn_route(), fake_search({"편의점": [(move(45, 5), "CU")]}))
        again = harvest_candidates(
            turn_route(), fake_search({"편의점": [(move(45, 5), "CU")]}),
            existing_ids=[first[0].id],
        )

        assert again == []          # 이미 등록·검수한 것을 draft 로 되돌리지 않는다
        assert first[0].id.startswith("auto-")

    def test_search_failure_skips_only_that_keyword(self):
        def flaky(center, keyword, limit):
            if keyword == "편의점":
                raise RuntimeError("network down")
            return [(move(44, 4), "행복약국")] if keyword == "약국" else []

        found = harvest_candidates(turn_route(), flaky)

        assert [lm.name for lm in found] == ["행복약국"]   # 한 번 실패가 전체를 비우지 않는다

    def test_no_turn_points_yields_nothing(self):
        route = RouteModel(polyline=(ORIGIN, move(100, 0)), turn_points=())
        found = harvest_candidates(route, fake_search({"편의점": [(move(50, 3), "CU")]}))

        assert found == []
