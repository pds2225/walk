"""TypeScript와 공유하는 golden trace로 Python 엔진 판정 일치를 고정한다."""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import Coordinate, PositionSample, RouteDeviationEngine, RouteModel, TurnPoint


def test_python_engine_matches_shared_golden_trace():
    fixture_path = (
        Path(__file__).resolve().parents[2]
        / "packages"
        / "route-engine"
        / "tests"
        / "fixtures"
        / "golden_trace.json"
    )
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    route_value = fixture["route"]
    route = RouteModel(
        polyline=tuple(
            Coordinate(item["latitude"], item["longitude"])
            for item in route_value["polyline"]
        ),
        turn_points=tuple(
            TurnPoint(
                item["id"],
                Coordinate(
                    item["coordinate"]["latitude"],
                    item["coordinate"]["longitude"],
                ),
                item["routeIndex"],
                item["direction"],
            )
            for item in route_value["turnPoints"]
        ),
    )
    engine = RouteDeviationEngine(route)
    actual = []
    for item in fixture["samples"]:
        result = engine.process_sample(PositionSample(
            latitude=item["latitude"],
            longitude=item["longitude"],
            heading_degrees=item["headingDegrees"],
            speed_meters_per_second=item["speedMetersPerSecond"],
            timestamp_ms=item["timestampMs"],
        ))
        actual.append({
            "state": result.state,
            "suggestedNextAction": result.suggested_next_action,
        })
    assert actual == fixture["expected"]
