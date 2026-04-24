"""Unit tests for RouteDeviationEngine state transitions — mirrors engine.test.ts."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import (
    Coordinate,
    EngineConfig,
    LocalPoint,
    PositionSample,
    RouteDeviationEngine,
    RouteModel,
    TurnPoint,
    project_from_local_meters,
)

ORIGIN = Coordinate(latitude=37.5665, longitude=126.978)


def move(east: float, north: float) -> Coordinate:
    return project_from_local_meters(ORIGIN, LocalPoint(east_meters=east, north_meters=north))


def sample(east: float, north: float, heading: float, ts: int, speed: float = 1.4) -> PositionSample:
    c = move(east, north)
    return PositionSample(
        latitude=c.latitude,
        longitude=c.longitude,
        heading_degrees=heading,
        speed_meters_per_second=speed,
        timestamp_ms=ts,
    )


def straight_route() -> RouteModel:
    return RouteModel(polyline=(ORIGIN, move(100, 0)), turn_points=())


def left_turn_route() -> RouteModel:
    return RouteModel(
        polyline=(ORIGIN, move(40, 0), move(40, 40)),
        turn_points=(
            TurnPoint(id="turn-left-1", coordinate=move(40, 0), route_index=1, direction="left"),
        ),
    )


class TestOnRoute:
    def test_normal_walking_returns_on_route(self):
        engine = RouteDeviationEngine(straight_route())
        result = engine.process_sample(sample(15, 0, 90, 1_000))

        assert result.state == "on_route"
        assert result.suggested_next_action == "none"
        assert "within_route_corridor" in result.reasons

    def test_score_is_low_on_route(self):
        engine = RouteDeviationEngine(straight_route())
        result = engine.process_sample(sample(15, 0, 90, 1_000))

        assert result.score <= 0.25


class TestDrifting:
    def test_mild_offset_returns_drifting(self):
        engine = RouteDeviationEngine(straight_route())
        result = engine.process_sample(sample(20, 11, 90, 1_000))

        assert result.state == "drifting"
        assert result.suggested_next_action == "monitor"
        assert "distance_over_drift_threshold" in result.reasons

    def test_drifting_score_at_least_0_4(self):
        engine = RouteDeviationEngine(straight_route())
        result = engine.process_sample(sample(20, 11, 90, 1_000))

        assert result.score >= 0.4


class TestDeviated:
    def test_sustained_breach_returns_deviated(self):
        engine = RouteDeviationEngine(straight_route())
        engine.process_sample(sample(20, 18, 0, 1_000))
        engine.process_sample(sample(25, 18, 0, 3_000))
        result = engine.process_sample(sample(30, 18, 0, 5_000))

        assert result.state == "deviated"
        assert result.suggested_next_action == "warn_user"
        assert "persistent_threshold_breach" in result.reasons
        assert "sustained_drift_duration" in result.reasons

    def test_deviated_score_at_least_0_75(self):
        engine = RouteDeviationEngine(straight_route())
        engine.process_sample(sample(20, 18, 0, 1_000))
        engine.process_sample(sample(25, 18, 0, 3_000))
        result = engine.process_sample(sample(30, 18, 0, 5_000))

        assert result.score >= 0.75


class TestPassedTurn:
    def test_missed_turn_returns_passed_turn(self):
        engine = RouteDeviationEngine(left_turn_route())
        engine.process_sample(sample(32, 0, 90, 1_000))
        result = engine.process_sample(sample(52, 0, 90, 2_000))

        assert result.state == "passed_turn"
        assert result.suggested_next_action == "reroute_candidate"
        assert "missed_expected_turn" in result.reasons
        assert result.metrics.distance_past_turn_point_meters >= 8.0

    def test_actual_turn_does_not_trigger_passed_turn(self):
        engine = RouteDeviationEngine(left_turn_route())
        engine.process_sample(sample(32, 0, 90, 1_000))
        result = engine.process_sample(sample(40, 12, 0, 2_000))

        assert result.state == "on_route"
        assert result.state != "passed_turn"

    def test_backtrack_before_turn_clears_passed_turn(self):
        engine = RouteDeviationEngine(left_turn_route())
        engine.process_sample(sample(32, 0, 90, 1_000))
        missed = engine.process_sample(sample(52, 0, 90, 2_000))
        assert missed.state == "passed_turn"

        recovered = engine.process_sample(sample(20, 0, 270, 3_000))
        assert recovered.state == "on_route"
        assert recovered.metrics.turn_approach_active is False


class TestCustomConfig:
    def test_tighter_thresholds_trigger_deviated_faster(self):
        config = EngineConfig(
            route_deviation_distance_threshold_meters=12,
            minimum_consecutive_samples_for_deviation=2,
            minimum_drift_duration_ms=1_000,
        )
        engine = RouteDeviationEngine(straight_route(), config=config)
        engine.process_sample(sample(20, 13, 0, 1_000))
        result = engine.process_sample(sample(25, 13, 0, 2_000))

        assert result.state == "deviated"
        assert result.metrics.consecutive_threshold_breaches == 2

    def test_looser_thresholds_keep_on_route(self):
        # north=18m offset would normally trigger drifting (drift_threshold=10),
        # but with raised threshold=20 and heading aligned to route, no breach occurs.
        config = EngineConfig(
            route_drift_distance_threshold_meters=20.0,
            route_deviation_distance_threshold_meters=30.0,
            minimum_consecutive_samples_for_deviation=10,
        )
        engine = RouteDeviationEngine(straight_route(), config=config)
        result = engine.process_sample(sample(20, 18, 90, 1_000))

        assert result.state == "on_route"


class TestSessionBehavior:
    def test_gps_noise_spike_does_not_deviate(self):
        engine = RouteDeviationEngine(straight_route())
        first = engine.process_sample(sample(10, 0, 90, 1_000))
        noisy = engine.process_sample(sample(15, 18, 0, 2_000))
        recovered = engine.process_sample(sample(20, 0, 90, 3_000))

        assert first.state == "on_route"
        assert noisy.state == "drifting"
        assert recovered.state == "on_route"
        assert recovered.metrics.consecutive_threshold_breaches == 0

    def test_counter_resets_after_returning_to_route(self):
        engine = RouteDeviationEngine(straight_route())
        engine.process_sample(sample(20, 18, 0, 1_000))
        engine.process_sample(sample(25, 0, 90, 2_000))
        engine.process_sample(sample(30, 18, 0, 3_000))

        assert engine._session.consecutive_threshold_breaches == 1
        assert engine._session.drift_start_timestamp_ms == 3_000
