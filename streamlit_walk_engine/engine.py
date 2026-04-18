"""Python port of the Walk route deviation engine (TypeScript source: packages/route-engine)."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal, Optional

DeviationState = Literal["on_route", "drifting", "deviated", "passed_turn"]
SuggestedAction = Literal["none", "monitor", "warn_user", "reroute_candidate"]


@dataclass(frozen=True)
class Coordinate:
    latitude: float
    longitude: float


@dataclass(frozen=True)
class PositionSample:
    latitude: float
    longitude: float
    heading_degrees: float
    speed_meters_per_second: float
    timestamp_ms: int


@dataclass(frozen=True)
class TurnPoint:
    id: str
    coordinate: Coordinate
    route_index: int
    direction: Literal["left", "right", "straight"]


@dataclass(frozen=True)
class RouteModel:
    polyline: tuple[Coordinate, ...]
    turn_points: tuple[TurnPoint, ...]


@dataclass(frozen=True)
class EngineConfig:
    route_drift_distance_threshold_meters: float = 10.0
    route_deviation_distance_threshold_meters: float = 15.0
    strong_deviation_distance_threshold_meters: float = 25.0
    heading_difference_threshold_degrees: float = 45.0
    pass_by_post_turn_distance_threshold_meters: float = 8.0
    turn_approach_distance_threshold_meters: float = 12.0
    minimum_consecutive_samples_for_deviation: int = 3
    minimum_drift_duration_ms: int = 4000


@dataclass
class EngineSessionState:
    consecutive_threshold_breaches: int = 0
    drift_start_timestamp_ms: Optional[int] = None
    active_approach_turn_id: Optional[str] = None


@dataclass(frozen=True)
class EngineMetrics:
    distance_from_route_meters: float
    expected_heading_degrees: float
    heading_difference_degrees: float
    nearest_segment_index: int
    route_distance_along_meters: float
    consecutive_threshold_breaches: int
    drift_duration_ms: int
    speed_meters_per_second: float
    turn_approach_active: bool
    nearest_turn_point_id: Optional[str] = None
    distance_to_next_turn_point_meters: Optional[float] = None
    distance_past_turn_point_meters: Optional[float] = None
    post_turn_heading_difference_degrees: Optional[float] = None


@dataclass(frozen=True)
class EngineResult:
    state: DeviationState
    score: float
    reasons: tuple[str, ...]
    metrics: EngineMetrics
    suggested_next_action: SuggestedAction


# ── Geometry ──────────────────────────────────────────────────────────────────

def distance_meters(a: Coordinate, b: Coordinate) -> float:
    R = 6_371_000.0
    phi1 = math.radians(a.latitude)
    phi2 = math.radians(b.latitude)
    dphi = math.radians(b.latitude - a.latitude)
    dlambda = math.radians(b.longitude - a.longitude)
    x = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.asin(math.sqrt(min(1.0, x)))


def bearing_degrees(a: Coordinate, b: Coordinate) -> float:
    phi1 = math.radians(a.latitude)
    phi2 = math.radians(b.latitude)
    dlambda = math.radians(b.longitude - a.longitude)
    x = math.sin(dlambda) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def angular_difference(a: float, b: float) -> float:
    diff = abs(a - b) % 360
    return min(diff, 360 - diff)


def point_to_segment_distance_meters(
    point: Coordinate,
    seg_start: Coordinate,
    seg_end: Coordinate,
) -> tuple[float, float]:
    """(distance_meters, distance_along_segment_meters)."""
    cos_lat = math.cos(math.radians(seg_start.latitude))

    def to_local(c: Coordinate) -> tuple[float, float]:
        x = (c.longitude - seg_start.longitude) * 111_111.0 * cos_lat
        y = (c.latitude - seg_start.latitude) * 111_111.0
        return x, y

    px, py = to_local(point)
    bx, by = to_local(seg_end)
    seg_len_sq = bx ** 2 + by ** 2

    if seg_len_sq < 1e-12:
        return math.sqrt(px ** 2 + py ** 2), 0.0

    t = max(0.0, min(1.0, (px * bx + py * by) / seg_len_sq))
    cx, cy = t * bx, t * by
    dist = math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
    along = t * math.sqrt(seg_len_sq)
    return dist, along


def point_to_polyline_distance_meters(
    point: Coordinate,
    polyline: tuple[Coordinate, ...],
) -> tuple[float, int, float]:
    """(min_distance_meters, nearest_segment_index, distance_along_route_meters)."""
    min_dist = float("inf")
    best_idx = 0
    best_along_route = 0.0
    cumulative = 0.0

    for i in range(len(polyline) - 1):
        dist, along = point_to_segment_distance_meters(point, polyline[i], polyline[i + 1])
        if dist < min_dist:
            min_dist = dist
            best_idx = i
            best_along_route = cumulative + along
        cumulative += distance_meters(polyline[i], polyline[i + 1])

    return min_dist, best_idx, best_along_route


# ── Prepared route ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class PreparedTurnPoint:
    id: str
    coordinate: Coordinate
    route_index: int
    direction: Literal["left", "right", "straight"]
    exit_heading_degrees: float


@dataclass(frozen=True)
class PreparedRoute:
    polyline: tuple[Coordinate, ...]
    segment_headings: tuple[float, ...]
    turn_points: tuple[PreparedTurnPoint, ...]


def prepare_route(route: RouteModel) -> PreparedRoute:
    headings = [
        bearing_degrees(route.polyline[i], route.polyline[i + 1])
        for i in range(len(route.polyline) - 1)
    ]
    prepared_turns = []
    for tp in route.turn_points:
        exit_idx = min(tp.route_index, len(headings) - 1)
        exit_heading = headings[exit_idx] if headings else 0.0
        prepared_turns.append(PreparedTurnPoint(
            id=tp.id,
            coordinate=tp.coordinate,
            route_index=tp.route_index,
            direction=tp.direction,
            exit_heading_degrees=exit_heading,
        ))
    return PreparedRoute(
        polyline=route.polyline,
        segment_headings=tuple(headings),
        turn_points=tuple(prepared_turns),
    )


def _vertex_cumulative_distances(polyline: tuple[Coordinate, ...]) -> list[float]:
    dists = [0.0]
    for i in range(len(polyline) - 1):
        dists.append(dists[-1] + distance_meters(polyline[i], polyline[i + 1]))
    return dists


def get_next_turn_point(
    prepared_route: PreparedRoute,
    distance_along_route: float,
) -> Optional[tuple[PreparedTurnPoint, float]]:
    vertex_dists = _vertex_cumulative_distances(prepared_route.polyline)
    best: Optional[PreparedTurnPoint] = None
    best_dist = float("inf")
    for tp in prepared_route.turn_points:
        if tp.route_index < len(vertex_dists):
            turn_dist = vertex_dists[tp.route_index]
            if turn_dist >= distance_along_route:
                d = turn_dist - distance_along_route
                if d < best_dist:
                    best_dist = d
                    best = tp
    return (best, best_dist) if best is not None else None


def get_expected_heading(prepared_route: PreparedRoute, segment_index: int) -> float:
    if not prepared_route.segment_headings:
        return 0.0
    idx = max(0, min(segment_index, len(prepared_route.segment_headings) - 1))
    return prepared_route.segment_headings[idx]


def get_distance_past_turn_point(turn_point: PreparedTurnPoint, sample: PositionSample) -> float:
    return distance_meters(turn_point.coordinate, Coordinate(sample.latitude, sample.longitude))


# ── Core evaluation ───────────────────────────────────────────────────────────

def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _compute_score(
    config: EngineConfig,
    dist: float,
    heading_diff: float,
    consecutive: int,
    drift_ms: int,
) -> float:
    d = _clamp(dist / config.strong_deviation_distance_threshold_meters, 0, 1)
    h = _clamp(heading_diff / 180, 0, 1)
    c = _clamp(consecutive / config.minimum_consecutive_samples_for_deviation, 0, 1)
    t = _clamp(drift_ms / config.minimum_drift_duration_ms, 0, 1)
    return round((0.45 * d + 0.2 * h + 0.2 * c + 0.15 * t) * 1000) / 1000


def _resolve_action(
    state: DeviationState,
    strong_distance_breach: bool,
    score: float,
) -> SuggestedAction:
    if state == "on_route":
        return "none"
    if state == "drifting":
        return "monitor"
    if state == "deviated":
        return "reroute_candidate" if strong_distance_breach or score >= 0.85 else "warn_user"
    return "reroute_candidate"  # passed_turn


def evaluate_deviation_step(
    prepared_route: PreparedRoute,
    sample: PositionSample,
    session: EngineSessionState,
    config: EngineConfig,
) -> tuple[EngineResult, EngineSessionState]:
    sample_coord = Coordinate(sample.latitude, sample.longitude)

    dist_from_route, nearest_seg_idx, dist_along_route = point_to_polyline_distance_meters(
        sample_coord, prepared_route.polyline
    )
    expected_heading = get_expected_heading(prepared_route, nearest_seg_idx)
    heading_diff = angular_difference(sample.heading_degrees, expected_heading)

    next_turn_ctx = get_next_turn_point(prepared_route, dist_along_route)

    active_id = session.active_approach_turn_id
    entered_approach = False

    if next_turn_ctx is not None:
        next_tp, dist_to_next = next_turn_ctx
        if dist_to_next <= config.turn_approach_distance_threshold_meters:
            entered_approach = next_tp.id != session.active_approach_turn_id
            active_id = next_tp.id

    active_turn: Optional[PreparedTurnPoint] = None
    if active_id is not None:
        for tp in prepared_route.turn_points:
            if tp.id == active_id:
                active_turn = tp
                break

    drift_breach = dist_from_route >= config.route_drift_distance_threshold_meters
    dev_breach = dist_from_route >= config.route_deviation_distance_threshold_meters
    strong_breach = dist_from_route >= config.strong_deviation_distance_threshold_meters
    heading_conflict = heading_diff >= config.heading_difference_threshold_degrees
    threshold_breach = drift_breach or (
        heading_conflict and dist_from_route >= config.route_drift_distance_threshold_meters * 0.6
    )

    consecutive = session.consecutive_threshold_breaches + 1 if threshold_breach else 0
    drift_start: Optional[int]
    if threshold_breach:
        drift_start = session.drift_start_timestamp_ms if session.drift_start_timestamp_ms is not None else sample.timestamp_ms
    else:
        drift_start = None
    drift_ms = (sample.timestamp_ms - drift_start) if (threshold_breach and drift_start is not None) else 0

    dist_past_turn: Optional[float] = None
    post_turn_heading_diff: Optional[float] = None
    passed_turn = False

    if active_turn is not None:
        post_turn_heading_diff = angular_difference(sample.heading_degrees, active_turn.exit_heading_degrees)
        aligned = (
            post_turn_heading_diff < config.heading_difference_threshold_degrees / 2
            and dist_from_route < config.route_drift_distance_threshold_meters
            and nearest_seg_idx >= active_turn.route_index
        )
        if aligned:
            active_id = None
            post_turn_heading_diff = None
        else:
            dist_past_turn = get_distance_past_turn_point(active_turn, sample)
            far_enough = dist_past_turn >= config.pass_by_post_turn_distance_threshold_meters
            conflicting = post_turn_heading_diff >= config.heading_difference_threshold_degrees
            left_route = dist_from_route >= config.route_drift_distance_threshold_meters * 0.7
            passed_turn = far_enough and conflicting and left_route

            # Backtrack recovery: user returned to route before the turn point
            if (
                nearest_seg_idx < active_turn.route_index
                and dist_from_route < config.route_drift_distance_threshold_meters
            ):
                active_id = None
                passed_turn = False

    persistent = consecutive >= config.minimum_consecutive_samples_for_deviation
    sustained = drift_ms >= config.minimum_drift_duration_ms
    deviated = (
        not passed_turn
        and (persistent or sustained)
        and (dev_breach or strong_breach or (drift_breach and heading_conflict))
    )
    drifting = not passed_turn and not deviated and threshold_breach

    if passed_turn:
        state: DeviationState = "passed_turn"
    elif deviated:
        state = "deviated"
    elif drifting:
        state = "drifting"
    else:
        state = "on_route"

    reasons: list[str] = []
    if state == "on_route":
        reasons.append("within_route_corridor")
    else:
        if drift_breach:
            reasons.append("distance_over_drift_threshold")
        if dev_breach:
            reasons.append("distance_over_deviation_threshold")
        if strong_breach:
            reasons.append("strong_distance_breach")
        if heading_conflict:
            reasons.append("heading_conflicts_with_route")
        if persistent:
            reasons.append("persistent_threshold_breach")
        if sustained:
            reasons.append("sustained_drift_duration")
    if entered_approach or active_id is not None:
        reasons.append("entered_turn_approach_zone")
    if passed_turn:
        reasons.extend(["missed_expected_turn", "continued_past_turn_in_conflicting_direction"])

    score = _compute_score(config, dist_from_route, heading_diff, consecutive, drift_ms)
    if passed_turn:
        score = max(score, 0.95)
    elif deviated:
        score = max(score, 0.75)
    elif drifting:
        score = max(score, 0.4)
    else:
        score = min(score, 0.25)

    nearest_turn_id: Optional[str] = None
    dist_to_next_turn: Optional[float] = None
    if next_turn_ctx is not None:
        nearest_turn_id = next_turn_ctx[0].id
        dist_to_next_turn = next_turn_ctx[1]

    metrics = EngineMetrics(
        distance_from_route_meters=dist_from_route,
        expected_heading_degrees=expected_heading,
        heading_difference_degrees=heading_diff,
        nearest_segment_index=nearest_seg_idx,
        route_distance_along_meters=dist_along_route,
        consecutive_threshold_breaches=consecutive,
        drift_duration_ms=drift_ms,
        speed_meters_per_second=sample.speed_meters_per_second,
        turn_approach_active=active_id is not None,
        nearest_turn_point_id=nearest_turn_id,
        distance_to_next_turn_point_meters=dist_to_next_turn,
        distance_past_turn_point_meters=dist_past_turn,
        post_turn_heading_difference_degrees=post_turn_heading_diff,
    )

    result = EngineResult(
        state=state,
        score=score,
        reasons=tuple(reasons),
        metrics=metrics,
        suggested_next_action=_resolve_action(state, strong_breach, score),
    )

    next_session = EngineSessionState(
        consecutive_threshold_breaches=consecutive,
        drift_start_timestamp_ms=drift_start,
        active_approach_turn_id=active_id,
    )

    return result, next_session


class RouteDeviationEngine:
    def __init__(self, route: RouteModel, config: Optional[EngineConfig] = None) -> None:
        self._prepared = prepare_route(route)
        self._config = config or EngineConfig()
        self._session = EngineSessionState()

    def process_sample(self, sample: PositionSample) -> EngineResult:
        result, self._session = evaluate_deviation_step(
            self._prepared, sample, self._session, self._config
        )
        return result

    def reset(self) -> None:
        self._session = EngineSessionState()
