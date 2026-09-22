"""route_score — 경로추천 5지표·방향차·모드 가중치 단위 테스트."""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import (
    Coordinate,
    LocalPoint,
    RouteModel,
    TurnPoint,
    angular_difference,
    project_from_local_meters,
)
from route_score import (
    DEFAULT_ROUTE_MODE,
    ROUTE_MODE_EASY,
    ROUTE_MODE_FAST,
    extract_route_metrics,
    heading_diff_penalty,
    heading_difference_degrees,
    initial_route_bearing_degrees,
    rank_routes,
    route_score_diag_payload,
    score_candidate,
    select_best_route,
)

ORIGIN = Coordinate(latitude=37.5665, longitude=126.978)


def _at(east: float, north: float) -> Coordinate:
    return project_from_local_meters(ORIGIN, LocalPoint(east_meters=east, north_meters=north))


def _route(*points: Coordinate, turns: tuple[int, ...] = ()) -> RouteModel:
    turn_points = tuple(
        TurnPoint(
            id=f"turn-{i}",
            coordinate=points[idx],
            route_index=idx,
            direction="left",
        )
        for i, idx in enumerate(turns, start=1)
    )
    return RouteModel(polyline=tuple(points), turn_points=turn_points)


class DummyInfo:
    def __init__(self, total_distance_meters: float, **extra):
        self.total_distance_meters = total_distance_meters
        for key, value in extra.items():
            setattr(self, key, value)


class TestHeadingDifferenceWrap:
    def test_350_vs_10_is_20_not_340(self):
        assert heading_difference_degrees(350, 10) == pytest.approx(20)

    def test_10_vs_350_is_20(self):
        assert heading_difference_degrees(10, 350) == pytest.approx(20)

    def test_range_is_0_to_180(self):
        assert heading_difference_degrees(0, 0) == pytest.approx(0)
        assert heading_difference_degrees(0, 180) == pytest.approx(180)
        assert heading_difference_degrees(90, 270) == pytest.approx(180)
        assert 0 <= heading_difference_degrees(1, 359) <= 180

    def test_0_is_better_than_180(self):
        assert heading_diff_penalty(0) < heading_diff_penalty(180)

    def test_180_is_stronger_than_15(self):
        assert heading_diff_penalty(180) > heading_diff_penalty(15) * 10


class TestInitialBearing:
    def test_first_valid_east_segment(self):
        route = (_at(0, 0), _at(40, 0), _at(40, 40))
        assert initial_route_bearing_degrees(route) == pytest.approx(90, abs=1)

    def test_skips_duplicate_then_tiny_jitter(self):
        start = _at(0, 0)
        jitter = _at(0.5, 0)  # ~0.5m — MIN_INITIAL_SEGMENT_METERS(4m) 미만
        ahead = _at(0, 40)    # 북쪽
        bearing = initial_route_bearing_degrees((start, start, jitter, ahead))
        assert angular_difference(bearing, 0) < 2

    def test_empty_or_single_is_none(self):
        assert initial_route_bearing_degrees(()) is None
        assert initial_route_bearing_degrees((_at(0, 0),)) is None


class TestRankingExampleAvsB:
    """A 520m/15° 가 B 490m/175° 를 편한길에서 이길 수 있다(항상 짧은 길을 고르지 않음)."""

    def _ab(self):
        # A: 동쪽으로 520m (첫 진행 90°)
        route_a = _route(_at(0, 0), _at(520, 0))
        # B: 서쪽으로 490m (첫 진행 270°)
        route_b = _route(_at(0, 0), _at(-490, 0))
        info_a = DummyInfo(520)
        info_b = DummyInfo(490)
        return [(route_a, info_a), (route_b, info_b)]

    def test_easy_mode_prefers_aligned_longer_path(self):
        ranked = rank_routes(self._ab(), user_heading_deg=75.0, mode=ROUTE_MODE_EASY)
        # 사용자 75° vs A 90° → 15°, vs B 270° → 165°
        assert ranked[0].metrics.total_distance_meters == pytest.approx(520)
        assert ranked[0].metrics.initial_heading_diff_deg == pytest.approx(15, abs=1)
        assert ranked[1].metrics.initial_heading_diff_deg == pytest.approx(165, abs=2)

    def test_fast_mode_prefers_shorter_path(self):
        ranked = rank_routes(self._ab(), user_heading_deg=75.0, mode=ROUTE_MODE_FAST)
        assert ranked[0].metrics.total_distance_meters == pytest.approx(490)

    def test_does_not_hard_exclude_near_180(self):
        winner = select_best_route(self._ab(), user_heading_deg=75.0, mode=ROUTE_MODE_FAST)
        assert winner is not None
        # 빠른길은 짧은 B를 고르지만, B는 탈락이 아니라 점수 비교의 승자.
        assert winner.metrics.initial_heading_diff_deg == pytest.approx(165, abs=2)
        assert winner.cost < 10  # 무한대/제외 플래그가 아님


class TestMetricsAndDiag:
    def test_extracts_five_metric_fields(self):
        route = _route(_at(0, 0), _at(80, 0), _at(80, 80), turns=(1,))
        metrics = extract_route_metrics(route, user_heading_deg=90.0, total_distance_meters=160)
        assert metrics.total_distance_meters == pytest.approx(160)
        assert metrics.initial_heading_diff_deg == pytest.approx(0, abs=2)
        assert metrics.turn_count == 1
        assert metrics.fork_count == 0
        assert metrics.sidewalk_ratio is None
        assert metrics.discomfort_count == 0

    def test_diag_fields_include_heading_and_scores(self):
        route = _route(_at(0, 0), _at(100, 0))
        scored = score_candidate(route, DummyInfo(100), user_heading_deg=90.0, mode=DEFAULT_ROUTE_MODE)
        payload = route_score_diag_payload(scored, [scored], user_heading_deg=90.0)
        assert payload["user_heading_deg"] == pytest.approx(90.0)
        assert payload["initial_route_bearing_deg"] == pytest.approx(90, abs=1)
        assert payload["initial_heading_diff_deg"] == pytest.approx(0, abs=1)
        assert payload["total_distance_m"] == pytest.approx(100)
        assert "turn_related_score" in payload
        assert "final_route_score" in payload
        assert payload["candidates"][0]["final_route_score"] == payload["final_route_score"]
