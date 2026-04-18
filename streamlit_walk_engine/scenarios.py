"""Simulation scenarios mirroring packages/route-engine/src/simulator/scenarios.ts."""

from __future__ import annotations

import math
from dataclasses import dataclass

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
    name: str
    description: str
    route: RouteModel
    samples: list[PositionSample]
    # local meter positions for visualization: (east, north)
    positions: list[tuple[float, float]]


def get_scenarios() -> list[Scenario]:
    _n = [(10, 0, 90, 1_000), (25, 0, 90, 3_000), (40, 0, 90, 5_000)]
    _d = [(20, 11, 90, 1_000), (28, 12, 90, 3_000)]
    _s = [(20, 18, 0, 1_000), (25, 18, 0, 3_000), (30, 18, 0, 5_000)]
    _m = [(32, 0, 90, 1_000), (40, 0, 90, 2_000), (52, 0, 90, 3_000)]

    return [
        Scenario(
            name="정상 보행",
            description="경로를 따라 동쪽으로 정상 이동합니다.",
            route=build_straight_route(),
            samples=[make_sample(e, n, h, t) for e, n, h, t in _n],
            positions=[(e, n) for e, n, *_ in _n],
        ),
        Scenario(
            name="경미한 이탈",
            description="경로에서 약간 벗어났지만 계속 전진합니다.",
            route=build_straight_route(),
            samples=[make_sample(e, n, h, t) for e, n, h, t in _d],
            positions=[(e, n) for e, n, *_ in _d],
        ),
        Scenario(
            name="강한 이탈",
            description="여러 샘플에 걸쳐 경로에서 지속적으로 벗어납니다.",
            route=build_straight_route(),
            samples=[make_sample(e, n, h, t) for e, n, h, t in _s],
            positions=[(e, n) for e, n, *_ in _s],
        ),
        Scenario(
            name="회전 미이행",
            description="좌회전 지점에 진입했지만 직진으로 통과합니다.",
            route=build_left_turn_route(),
            samples=[make_sample(e, n, h, t) for e, n, h, t in _m],
            positions=[(e, n) for e, n, *_ in _m],
        ),
    ]
