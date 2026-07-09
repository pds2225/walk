"""Python port of the Walk route deviation engine (TypeScript source: packages/route-engine)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal, Optional

DeviationState = Literal["on_route", "drifting", "deviated", "passed_turn"]
SuggestedAction = Literal["none", "monitor", "warn_user", "reroute_candidate"]

EARTH_RADIUS_METERS = 6_371_000.0


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


@dataclass(frozen=True)
class LocalPoint:
    east_meters: float
    north_meters: float


@dataclass(frozen=True)
class SegmentProjection:
    distance_meters: float
    projected_coordinate: Coordinate
    projection_ratio: float


@dataclass(frozen=True)
class PolylineProjection(SegmentProjection):
    segment_index: int


@dataclass(frozen=True)
class PreparedTurnPoint:
    id: str
    coordinate: Coordinate
    route_index: int
    direction: Literal["left", "right", "straight"]
    approach_heading_degrees: float
    exit_heading_degrees: float
    distance_along_route_meters: float


@dataclass(frozen=True)
class PreparedRoute:
    route: RouteModel
    segment_headings: tuple[float, ...]
    segment_lengths_meters: tuple[float, ...]
    cumulative_distances_meters: tuple[float, ...]
    turn_points: tuple[PreparedTurnPoint, ...]


@dataclass(frozen=True)
class NearestRouteSegment:
    segment_index: int
    distance_meters: float
    projected_coordinate: Coordinate
    projection_ratio: float
    distance_along_route_meters: float


def _to_radians(value: float) -> float:
    return (value * math.pi) / 180


def _to_degrees(value: float) -> float:
    return (value * 180) / math.pi


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def _round_score(score: float) -> float:
    return round(score * 1000) / 1000


def normalize_heading(heading_degrees: float) -> float:
    normalized_heading = heading_degrees % 360
    if normalized_heading < 0:
        return normalized_heading + 360
    return normalized_heading


def project_to_local_meters(origin: Coordinate, coordinate: Coordinate) -> LocalPoint:
    latitude_delta_radians = _to_radians(coordinate.latitude - origin.latitude)
    longitude_delta_radians = _to_radians(coordinate.longitude - origin.longitude)
    mean_latitude_radians = _to_radians((origin.latitude + coordinate.latitude) / 2)
    return LocalPoint(
        east_meters=longitude_delta_radians * EARTH_RADIUS_METERS * math.cos(mean_latitude_radians),
        north_meters=latitude_delta_radians * EARTH_RADIUS_METERS,
    )


def project_from_local_meters(origin: Coordinate, point: LocalPoint) -> Coordinate:
    latitude = origin.latitude + _to_degrees(point.north_meters / EARTH_RADIUS_METERS)
    meters_per_degree_longitude = EARTH_RADIUS_METERS * math.cos(_to_radians(origin.latitude))
    longitude = origin.longitude + _to_degrees(point.east_meters / meters_per_degree_longitude)
    return Coordinate(latitude=latitude, longitude=longitude)


def distance_meters(start: Coordinate, end: Coordinate) -> float:
    start_latitude_radians = _to_radians(start.latitude)
    end_latitude_radians = _to_radians(end.latitude)
    latitude_delta_radians = _to_radians(end.latitude - start.latitude)
    longitude_delta_radians = _to_radians(end.longitude - start.longitude)
    haversine_component = (
        math.sin(latitude_delta_radians / 2) ** 2
        + math.cos(start_latitude_radians)
        * math.cos(end_latitude_radians)
        * math.sin(longitude_delta_radians / 2) ** 2
    )
    return 2 * EARTH_RADIUS_METERS * math.asin(math.sqrt(haversine_component))


def bearing_degrees(start: Coordinate, end: Coordinate) -> float:
    start_latitude_radians = _to_radians(start.latitude)
    end_latitude_radians = _to_radians(end.latitude)
    longitude_delta_radians = _to_radians(end.longitude - start.longitude)
    y = math.sin(longitude_delta_radians) * math.cos(end_latitude_radians)
    x = (
        math.cos(start_latitude_radians) * math.sin(end_latitude_radians)
        - math.sin(start_latitude_radians)
        * math.cos(end_latitude_radians)
        * math.cos(longitude_delta_radians)
    )
    return normalize_heading(_to_degrees(math.atan2(y, x)))


def angular_difference(first_heading_degrees: float, second_heading_degrees: float) -> float:
    difference = abs(
        normalize_heading(first_heading_degrees) - normalize_heading(second_heading_degrees)
    )
    return 360 - difference if difference > 180 else difference


def project_point_to_segment_meters(
    point: Coordinate,
    segment_start: Coordinate,
    segment_end: Coordinate,
) -> SegmentProjection:
    point_local = project_to_local_meters(segment_start, point)
    end_local = project_to_local_meters(segment_start, segment_end)
    segment_length_squared = end_local.east_meters ** 2 + end_local.north_meters ** 2

    if segment_length_squared == 0:
        return SegmentProjection(
            distance_meters=distance_meters(point, segment_start),
            projected_coordinate=segment_start,
            projection_ratio=0.0,
        )

    raw_projection_ratio = (
        point_local.east_meters * end_local.east_meters
        + point_local.north_meters * end_local.north_meters
    ) / segment_length_squared
    projection_ratio = _clamp(raw_projection_ratio, 0.0, 1.0)
    projected_point = LocalPoint(
        east_meters=end_local.east_meters * projection_ratio,
        north_meters=end_local.north_meters * projection_ratio,
    )
    delta_east_meters = point_local.east_meters - projected_point.east_meters
    delta_north_meters = point_local.north_meters - projected_point.north_meters
    return SegmentProjection(
        distance_meters=math.hypot(delta_east_meters, delta_north_meters),
        projected_coordinate=project_from_local_meters(segment_start, projected_point),
        projection_ratio=projection_ratio,
    )


def point_to_segment_distance_meters(
    point: Coordinate,
    segment_start: Coordinate,
    segment_end: Coordinate,
) -> tuple[float, float]:
    projection = project_point_to_segment_meters(point, segment_start, segment_end)
    segment_length_meters = distance_meters(segment_start, segment_end)
    return projection.distance_meters, segment_length_meters * projection.projection_ratio


def project_point_to_polyline_meters(
    point: Coordinate,
    polyline: tuple[Coordinate, ...],
) -> PolylineProjection:
    if len(polyline) < 2:
        raise ValueError("Route polyline must contain at least two coordinates.")

    best_projection: Optional[PolylineProjection] = None
    for segment_index in range(len(polyline) - 1):
        segment_start = polyline[segment_index]
        segment_end = polyline[segment_index + 1]
        projection = project_point_to_segment_meters(point, segment_start, segment_end)
        if best_projection is None or projection.distance_meters < best_projection.distance_meters:
            best_projection = PolylineProjection(
                distance_meters=projection.distance_meters,
                projected_coordinate=projection.projected_coordinate,
                projection_ratio=projection.projection_ratio,
                segment_index=segment_index,
            )

    if best_projection is None:
        raise ValueError("Unable to project point onto polyline.")

    return best_projection


def point_to_polyline_distance_meters(
    point: Coordinate,
    polyline: tuple[Coordinate, ...],
) -> tuple[float, int, float]:
    projection = project_point_to_polyline_meters(point, polyline)
    cumulative_distance = 0.0
    for segment_index in range(projection.segment_index):
        cumulative_distance += distance_meters(polyline[segment_index], polyline[segment_index + 1])

    segment_length_meters = distance_meters(
        polyline[projection.segment_index],
        polyline[projection.segment_index + 1],
    )
    return (
        projection.distance_meters,
        projection.segment_index,
        cumulative_distance + segment_length_meters * projection.projection_ratio,
    )


def distance_along_heading_meters(origin: Coordinate, heading_degrees: float, point: Coordinate) -> float:
    local_point = project_to_local_meters(origin, point)
    normalized_heading_radians = _to_radians(normalize_heading(heading_degrees))
    heading_vector_east = math.sin(normalized_heading_radians)
    heading_vector_north = math.cos(normalized_heading_radians)
    return (
        local_point.east_meters * heading_vector_east
        + local_point.north_meters * heading_vector_north
    )


def assert_valid_polyline(polyline: tuple[Coordinate, ...]) -> None:
    if len(polyline) < 2:
        raise ValueError("Route polyline must contain at least two coordinates.")


def derive_segment_lengths(polyline: tuple[Coordinate, ...]) -> tuple[float, ...]:
    assert_valid_polyline(polyline)
    return tuple(
        distance_meters(polyline[segment_index], polyline[segment_index + 1])
        for segment_index in range(len(polyline) - 1)
    )


def derive_cumulative_distances(segment_lengths: tuple[float, ...]) -> tuple[float, ...]:
    cumulative_distances = [0.0]
    for segment_length in segment_lengths:
        cumulative_distances.append(cumulative_distances[-1] + segment_length)
    return tuple(cumulative_distances)


def validate_turn_point(polyline: tuple[Coordinate, ...], turn_point: TurnPoint) -> None:
    if turn_point.route_index <= 0 or turn_point.route_index >= len(polyline) - 1:
        raise ValueError(
            f'Turn point "{turn_point.id}" must reference a route index with both approach and exit segments.'
        )


def prepare_route(route: RouteModel) -> PreparedRoute:
    assert_valid_polyline(route.polyline)
    segment_headings = tuple(
        bearing_degrees(route.polyline[segment_index], route.polyline[segment_index + 1])
        for segment_index in range(len(route.polyline) - 1)
    )
    segment_lengths_meters = derive_segment_lengths(route.polyline)
    cumulative_distances_meters = derive_cumulative_distances(segment_lengths_meters)

    prepared_turns = []
    for turn_point in sorted(route.turn_points, key=lambda item: item.route_index):
        validate_turn_point(route.polyline, turn_point)
        prepared_turns.append(
            PreparedTurnPoint(
                id=turn_point.id,
                coordinate=turn_point.coordinate,
                route_index=turn_point.route_index,
                direction=turn_point.direction,
                approach_heading_degrees=segment_headings[turn_point.route_index - 1],
                exit_heading_degrees=segment_headings[turn_point.route_index],
                distance_along_route_meters=cumulative_distances_meters[turn_point.route_index],
            )
        )

    return PreparedRoute(
        route=route,
        segment_headings=segment_headings,
        segment_lengths_meters=segment_lengths_meters,
        cumulative_distances_meters=cumulative_distances_meters,
        turn_points=tuple(prepared_turns),
    )


def find_nearest_route_segment(prepared_route: PreparedRoute, sample: Coordinate) -> NearestRouteSegment:
    projection = project_point_to_polyline_meters(sample, prepared_route.route.polyline)
    segment_distance_start = prepared_route.cumulative_distances_meters[projection.segment_index]
    segment_length_meters = prepared_route.segment_lengths_meters[projection.segment_index]
    return NearestRouteSegment(
        segment_index=projection.segment_index,
        distance_meters=projection.distance_meters,
        projected_coordinate=projection.projected_coordinate,
        projection_ratio=projection.projection_ratio,
        distance_along_route_meters=segment_distance_start + segment_length_meters * projection.projection_ratio,
    )


def find_nearest_turn_point(prepared_route: PreparedRoute, sample: Coordinate) -> Optional[PreparedTurnPoint]:
    nearest_turn_point: Optional[PreparedTurnPoint] = None
    nearest_distance_meters = float("inf")
    for turn_point in prepared_route.turn_points:
        turn_distance_meters = distance_meters(sample, turn_point.coordinate)
        if turn_distance_meters < nearest_distance_meters:
            nearest_turn_point = turn_point
            nearest_distance_meters = turn_distance_meters
    return nearest_turn_point


def get_next_turn_point(
    prepared_route: PreparedRoute,
    current_distance_along_route_meters: float,
) -> Optional[tuple[PreparedTurnPoint, float]]:
    tolerance_meters = 3.0
    for turn_point in prepared_route.turn_points:
        signed_distance_to_turn_meters = (
            turn_point.distance_along_route_meters - current_distance_along_route_meters
        )
        if abs(signed_distance_to_turn_meters) <= tolerance_meters:
            return turn_point, max(0.0, signed_distance_to_turn_meters)
        if signed_distance_to_turn_meters > 0:
            return turn_point, max(0.0, signed_distance_to_turn_meters)
    return None


def get_expected_heading(prepared_route: PreparedRoute, segment_index: int) -> float:
    expected_heading_degrees = prepared_route.segment_headings[segment_index]
    return expected_heading_degrees


def get_distance_past_turn_point(turn_point: PreparedTurnPoint, sample: PositionSample) -> float:
    return max(
        0.0,
        distance_along_heading_meters(
            turn_point.coordinate,
            turn_point.approach_heading_degrees,
            Coordinate(sample.latitude, sample.longitude),
        ),
    )


def _compute_score(
    config: EngineConfig,
    dist: float,
    heading_diff: float,
    consecutive: int,
    drift_ms: int,
) -> float:
    distance_score = _clamp(dist / config.strong_deviation_distance_threshold_meters, 0.0, 1.0)
    heading_score = _clamp(heading_diff / 180.0, 0.0, 1.0)
    consecutive_score = _clamp(
        consecutive / config.minimum_consecutive_samples_for_deviation,
        0.0,
        1.0,
    )
    duration_score = _clamp(drift_ms / config.minimum_drift_duration_ms, 0.0, 1.0)
    return _round_score(
        0.45 * distance_score
        + 0.2 * heading_score
        + 0.2 * consecutive_score
        + 0.15 * duration_score
    )


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
    return "reroute_candidate"


def _resolve_active_turn(
    prepared_route: PreparedRoute,
    active_approach_turn_id: Optional[str],
) -> Optional[PreparedTurnPoint]:
    if active_approach_turn_id is None:
        return None
    for turn_point in prepared_route.turn_points:
        if turn_point.id == active_approach_turn_id:
            return turn_point
    return None


def evaluate_deviation_step(
    prepared_route: PreparedRoute,
    sample: PositionSample,
    session: EngineSessionState,
    config: EngineConfig,
) -> tuple[EngineResult, EngineSessionState]:
    sample_coordinate = Coordinate(sample.latitude, sample.longitude)
    nearest_segment = find_nearest_route_segment(prepared_route, sample_coordinate)
    expected_heading = get_expected_heading(prepared_route, nearest_segment.segment_index)
    heading_diff = angular_difference(sample.heading_degrees, expected_heading)
    nearest_turn_point = find_nearest_turn_point(prepared_route, sample_coordinate)
    next_turn_context = get_next_turn_point(
        prepared_route,
        nearest_segment.distance_along_route_meters,
    )

    active_id = session.active_approach_turn_id
    entered_approach = False
    if next_turn_context is not None:
        next_turn_point, distance_to_next_turn = next_turn_context
        if distance_to_next_turn <= config.turn_approach_distance_threshold_meters:
            entered_approach = next_turn_point.id != session.active_approach_turn_id
            active_id = next_turn_point.id

    active_turn = _resolve_active_turn(prepared_route, active_id)

    drift_breach = nearest_segment.distance_meters >= config.route_drift_distance_threshold_meters
    deviation_breach = nearest_segment.distance_meters >= config.route_deviation_distance_threshold_meters
    strong_breach = nearest_segment.distance_meters >= config.strong_deviation_distance_threshold_meters
    heading_conflict = heading_diff >= config.heading_difference_threshold_degrees
    threshold_breach = drift_breach or (
        heading_conflict
        and nearest_segment.distance_meters >= config.route_drift_distance_threshold_meters * 0.6
    )

    consecutive = session.consecutive_threshold_breaches + 1 if threshold_breach else 0
    drift_start = (
        session.drift_start_timestamp_ms if threshold_breach else None
    )
    if threshold_breach and drift_start is None:
        drift_start = sample.timestamp_ms
    drift_duration_ms = (
        sample.timestamp_ms - drift_start
        if threshold_breach and drift_start is not None
        else 0
    )

    distance_past_turn_meters: Optional[float] = None
    post_turn_heading_difference_degrees: Optional[float] = None
    passed_turn = False

    if active_turn is not None:
        post_turn_heading_difference_degrees = angular_difference(
            sample.heading_degrees,
            active_turn.exit_heading_degrees,
        )
        aligned_with_exit_heading = (
            post_turn_heading_difference_degrees < config.heading_difference_threshold_degrees / 2
            and nearest_segment.distance_meters < config.route_drift_distance_threshold_meters
            and nearest_segment.segment_index >= active_turn.route_index
        )

        if aligned_with_exit_heading:
            active_id = None
            post_turn_heading_difference_degrees = None
        else:
            distance_past_turn_meters = get_distance_past_turn_point(active_turn, sample)
            far_enough_past_turn = (
                distance_past_turn_meters >= config.pass_by_post_turn_distance_threshold_meters
            )
            conflicting_after_turn = (
                post_turn_heading_difference_degrees >= config.heading_difference_threshold_degrees
            )
            left_route_after_turn = (
                nearest_segment.distance_meters >= config.route_drift_distance_threshold_meters * 0.7
            )
            passed_turn = (
                far_enough_past_turn and conflicting_after_turn and left_route_after_turn
            )

            returned_before_turn = (
                nearest_segment.segment_index < active_turn.route_index
                and nearest_segment.distance_meters < config.route_drift_distance_threshold_meters
            )
            if returned_before_turn:
                active_id = None
                passed_turn = False

    persistent_threshold_breach = (
        consecutive >= config.minimum_consecutive_samples_for_deviation
    )
    sustained_drift_duration = drift_duration_ms >= config.minimum_drift_duration_ms
    deviated = (
        not passed_turn
        and (persistent_threshold_breach or sustained_drift_duration)
        and (
            deviation_breach
            or strong_breach
            or (drift_breach and heading_conflict)
        )
    )
    drifting = not passed_turn and not deviated and threshold_breach

    state: DeviationState = "on_route"
    if passed_turn:
        state = "passed_turn"
    elif deviated:
        state = "deviated"
    elif drifting:
        state = "drifting"

    reasons: list[str] = []
    if state == "on_route":
        reasons.append("within_route_corridor")
    else:
        if drift_breach:
            reasons.append("distance_over_drift_threshold")
        if deviation_breach:
            reasons.append("distance_over_deviation_threshold")
        if strong_breach:
            reasons.append("strong_distance_breach")
        if heading_conflict:
            reasons.append("heading_conflicts_with_route")
        if persistent_threshold_breach:
            reasons.append("persistent_threshold_breach")
        if sustained_drift_duration:
            reasons.append("sustained_drift_duration")

    if entered_approach or active_id is not None:
        reasons.append("entered_turn_approach_zone")

    if passed_turn:
        reasons.extend(
            ["missed_expected_turn", "continued_past_turn_in_conflicting_direction"]
        )

    score = _compute_score(
        config,
        nearest_segment.distance_meters,
        heading_diff,
        consecutive,
        drift_duration_ms,
    )
    if passed_turn:
        score = max(score, 0.95)
    elif deviated:
        score = max(score, 0.75)
    elif drifting:
        score = max(score, 0.4)
    else:
        score = min(score, 0.25)

    nearest_turn_point_id: Optional[str] = None
    distance_to_next_turn_point_meters: Optional[float] = None
    if next_turn_context is not None:
        nearest_turn_point_id = next_turn_context[0].id
        distance_to_next_turn_point_meters = next_turn_context[1]
    elif nearest_turn_point is not None:
        nearest_turn_point_id = nearest_turn_point.id

    metrics = EngineMetrics(
        distance_from_route_meters=nearest_segment.distance_meters,
        expected_heading_degrees=expected_heading,
        heading_difference_degrees=heading_diff,
        nearest_segment_index=nearest_segment.segment_index,
        route_distance_along_meters=nearest_segment.distance_along_route_meters,
        consecutive_threshold_breaches=consecutive,
        drift_duration_ms=drift_duration_ms,
        speed_meters_per_second=sample.speed_meters_per_second,
        turn_approach_active=active_id is not None,
        nearest_turn_point_id=nearest_turn_point_id,
        distance_to_next_turn_point_meters=distance_to_next_turn_point_meters,
        distance_past_turn_point_meters=distance_past_turn_meters,
        post_turn_heading_difference_degrees=post_turn_heading_difference_degrees,
    )

    result = EngineResult(
        state=state,
        score=_round_score(score),
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
            self._prepared,
            sample,
            self._session,
            self._config,
        )
        return result

    def reset(self) -> None:
        self._session = EngineSessionState()
