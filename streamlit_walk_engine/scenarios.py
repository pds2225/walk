"""Simulation scenarios mirroring packages/route-engine/src/simulator/scenarios.ts."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .engine import Coordinate, PositionSample, RouteModel, TurnPoint
elif __package__:
    from .engine import Coordinate, PositionSample, RouteModel, TurnPoint
else:
    from engine import Coordinate, PositionSample, RouteModel, TurnPoint

ORIGIN = Coordinate(latitude=37.5665, longitude=126.978)


def move_by_meters(origin: Coordinate, east: float, north: float) -> Coordinate:
    cos_lat = math.cos(math.radians(origin.latitude))
    return Coordinate(
        latitude=origin.latitude + north / 111_111.0,
        longitude=origin.longitude + east / (111_111.0 * cos_lat),
    )


def make_sample(east: float, north: float, heading: float, ts: int, speed: float = 1.4) -> PositionSample:
    c = move_by_meters(ORIGIN, east, north)
    return PositionSample(
        latitude=c.latitude,
        longitude=c.longitude,
        heading_degrees=heading,
        speed_meters_per_second=speed,
        timestamp_ms=ts,
    )


def build_straight_route() -> RouteModel:
    return RouteModel(
        polyline=(ORIGIN, move_by_meters(ORIGIN, 100, 0)),
        turn_points=(),
    )


def build_left_turn_route() -> RouteModel:
    return RouteModel(
        polyline=(
            ORIGIN,
            move_by_meters(ORIGIN, 40, 0),
            move_by_meters(ORIGIN, 40, 40),
        ),
        turn_points=(
            TurnPoint(
                id="turn-left-1",
                coordinate=move_by_meters(ORIGIN, 40, 0),
                route_index=1,
                direction="left",
            ),
        ),
    )


@dataclass
class Scenario:
    key: str
    name: str
    description: str
    expected_states: tuple[str, ...]
    route: RouteModel
    samples: list[PositionSample]
    # local meter positions for visualization: (east, north)
    positions: list[tuple[float, float]]


def get_scenarios() -> list[Scenario]:
    normal = [
        (8, 0, 90, 0),
        (16, 0, 90, 2_000),
        (24, 0, 90, 4_000),
        (32, 0, 90, 6_000),
        (40, 0, 90, 8_000),
        (48, 0, 90, 10_000),
    ]
    mild = [
        (8, 0, 90, 0),
        (16, 5, 90, 2_000),
        (24, 11, 90, 4_000),
        (32, 12, 90, 6_000),
        (40, 13, 90, 8_000),
        (48, 12, 90, 10_000),
    ]
    strong = [
        (8, 0, 90, 0),
        (16, 4, 90, 2_000),
        (24, 11, 90, 4_000),
        (32, 18, 0, 6_000),
        (40, 20, 0, 8_000),
        (48, 22, 0, 10_000),
    ]
    missed = [
        (20, 0, 90, 0),
        (30, 0, 90, 2_000),
        (38, 0, 90, 4_000),
        (42, 0, 90, 6_000),
        (47, 4, 90, 8_000),
        (52, 0, 90, 10_000),
    ]

    return [
        Scenario(
            key="normal_walking",
            name="정상 보행",
            description="경로를 따라 동쪽으로 정상 이동합니다.",
            expected_states=("on_route",),
            route=build_straight_route(),
            samples=[make_sample(e, n, h, t) for e, n, h, t in normal],
            positions=[(e, n) for e, n, *_ in normal],
        ),
        Scenario(
            key="mild_drift",
            name="경미한 이탈",
            description="초반에는 경로를 유지하다가, 허용 범위를 살짝 넘어서 drifting 상태가 이어집니다.",
            expected_states=("on_route", "drifting"),
            route=build_straight_route(),
            samples=[make_sample(e, n, h, t) for e, n, h, t in mild],
            positions=[(e, n) for e, n, *_ in mild],
        ),
        Scenario(
            key="strong_deviation",
            name="강한 이탈",
            description="처음에는 경로를 따르다가, 연속적인 거리·방향 위반으로 deviated 상태까지 올라갑니다.",
            expected_states=("on_route", "drifting", "deviated"),
            route=build_straight_route(),
            samples=[make_sample(e, n, h, t) for e, n, h, t in strong],
            positions=[(e, n) for e, n, *_ in strong],
        ),
        Scenario(
            key="missed_turn",
            name="회전 미이행",
            description="회전 지점에 접근한 뒤 계속 직진해서 drifting 후 passed_turn 상태가 발생합니다.",
            expected_states=("on_route", "drifting", "passed_turn"),
            route=build_left_turn_route(),
            samples=[make_sample(e, n, h, t) for e, n, h, t in missed],
            positions=[(e, n) for e, n, *_ in missed],
        ),
    ]
