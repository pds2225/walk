"""K-Navi 경로추천 점수 — 8/28 확정 5지표 + 모드별 가중치.

기존 추천은 TMAP searchOption=0(추천) 단일 경로를 그대로 썼고, 후보는 점수화하지
않았다. 이 모듈은 그 흐름을 새 알고리즘으로 바꾸지 않고, 같은 후보 세트에 아래
5지표를 가중 합산한다. 모드(빠른길/편한길/안전한길)는 가중치만 바꾼다.

사용자 대면 지표 (8/28 확정):
  1) 총 이동거리 — origin→dest 전체 경로 길이
  2) 방향 바꿈 횟수 및 각도 — (a) 사용자 heading vs 첫 진행방향,
     (b) 경로상 회전 횟수, (c) 각 회전 각도. (a)는 이 지표의 하위 변수.
  3) 총 갈림길 개수
  4) 보도 비율
  5) 보행 불편요소 수 및 비율 — 계단·급경사·육교·지하도 등.
     차량 노출·위험 횡단은 넣지 않는다(향후 안전 변수).

점수는 낮을수록 좋다(비용). 임계·가중치는 아래 named config 만 조정한다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, Sequence

from engine import Coordinate, RouteModel, angular_difference, bearing_degrees, distance_meters

# ── 모드 이름 (UI 라벨과 동일) ───────────────────────────────────────────────
ROUTE_MODE_FAST = "빠른길"
ROUTE_MODE_EASY = "편한길"
ROUTE_MODE_SAFE = "안전한길"
ROUTE_MODES = (ROUTE_MODE_FAST, ROUTE_MODE_EASY, ROUTE_MODE_SAFE)
DEFAULT_ROUTE_MODE = ROUTE_MODE_EASY

# 첫 진행방향을 잴 때 이보다 짧은 선분은 중복점·지터로 보고 건너뛴다.
MIN_INITIAL_SEGMENT_METERS = 4.0

# 회전으로 보는 최소 꺾임(°). route_builder.MIN_TURN_HEADING_CHANGE_DEGREES 와 맞춘다.
MIN_TURN_HEADING_CHANGE_DEGREES = 30.0
_TURN_HEADING_SPAN_METERS = 15.0

# 상대 정규화 실패(단일 후보) 때 쓰는 참조 스케일 — 현장 튜닝용.
DISTANCE_REF_METERS = 1000.0
TURN_COUNT_REF = 8.0
TURN_ANGLE_SUM_REF_DEGREES = 360.0
FORK_COUNT_REF = 8.0
DISCOMFORT_COUNT_REF = 6.0


@dataclass(frozen=True)
class HeadingPenaltyBand:
    """heading_difference(0–180°) 구간 → 패널티(0–1). 현장 시험 후 여기만 조정."""
    upper_degrees: float
    penalty: float
    name: str


# 0°에 가까울수록 이득, 180°는 강한 패널티. 루프에 매직넘버를 넣지 않는다.
HEADING_DIFF_PENALTY_BANDS: tuple[HeadingPenaltyBand, ...] = (
    HeadingPenaltyBand(30.0, 0.05, "almost_none"),
    HeadingPenaltyBand(60.0, 0.20, "weak"),
    HeadingPenaltyBand(120.0, 0.50, "medium"),
    HeadingPenaltyBand(150.0, 0.80, "large"),
    HeadingPenaltyBand(180.0, 1.00, "strong"),
)

# 지표 2 내부 비중 — (a) 초기 방향차, (b) 회전 횟수, (c) 회전 각도 합.
DIRECTION_CHANGE_PART_WEIGHTS = {
    "initial_heading": 0.50,
    "turn_count": 0.25,
    "turn_angle": 0.25,
}


@dataclass(frozen=True)
class ModeWeights:
    """5지표 가중치. 후보는 모드와 무관하게 같고, 가중치만 다르다."""
    distance: float          # 1) 총 이동거리
    direction_change: float  # 2) 방향 바꿈 횟수 및 각도 (초기 heading 포함)
    fork: float              # 3) 총 갈림길 개수
    sidewalk: float          # 4) 보도 비율 (낮을수록 비용↑)
    discomfort: float        # 5) 보행 불편요소 수 및 비율
    # 향후 안전 변수(차량 노출 등)는 여기 필드를 추가해 안전한길에만 올리면 된다.


MODE_WEIGHTS: dict[str, ModeWeights] = {
    ROUTE_MODE_FAST: ModeWeights(
        distance=1.00, direction_change=0.10, fork=0.10, sidewalk=0.08, discomfort=0.15,
    ),
    ROUTE_MODE_EASY: ModeWeights(
        distance=0.50, direction_change=1.00, fork=0.70, sidewalk=0.20, discomfort=0.85,
    ),
    ROUTE_MODE_SAFE: ModeWeights(
        distance=0.40, direction_change=0.30, fork=0.25, sidewalk=1.00, discomfort=0.35,
    ),
}


@dataclass(frozen=True)
class RouteQuality:
    """TMAP 등 기존 응답에서 뽑은 품질 값. 없으면 None/0 — 신규 수집 없음."""
    sidewalk_ratio: float | None = None
    fork_count: int = 0
    discomfort_count: int = 0
    discomfort_ratio: float | None = None
    turn_angles_degrees: tuple[float, ...] = ()


@dataclass(frozen=True)
class RouteMetrics:
    """5지표 + 지표 2 하위 변수."""
    total_distance_meters: float
    initial_heading_diff_deg: float | None
    initial_route_bearing_deg: float | None
    turn_count: int
    turn_angles_degrees: tuple[float, ...]
    fork_count: int
    sidewalk_ratio: float | None
    discomfort_count: int
    discomfort_ratio: float | None


@dataclass(frozen=True)
class ScoredRoute:
    """후보 1개의 점수. cost 가 낮을수록 추천."""
    route: RouteModel
    info: object
    metrics: RouteMetrics
    mode: str
    cost: float
    turn_related_score: float
    heading_penalty: float
    diag: dict = field(default_factory=dict)


def heading_difference_degrees(user_heading_deg: float, route_bearing_deg: float) -> float:
    """사용자 heading 과 경로 첫 진행방향의 최소각. 범위 0–180°, 0/360 래핑.

    예: 사용자 350° vs 경로 10° → 20° (340°가 아님).
    """
    return angular_difference(user_heading_deg, route_bearing_deg)


def initial_route_bearing_degrees(
    polyline: Sequence[Coordinate],
    *,
    min_segment_meters: float = MIN_INITIAL_SEGMENT_METERS,
) -> float | None:
    """후보 polyline 의 첫 유효 선분 방위(진북 시계방향). 짧은 선분은 건너뛴다."""
    if len(polyline) < 2:
        return None
    fallback: float | None = None
    for i in range(len(polyline) - 1):
        start, end = polyline[i], polyline[i + 1]
        length = distance_meters(start, end)
        if length <= 0.0:
            continue
        bearing = bearing_degrees(start, end)
        if fallback is None:
            fallback = bearing
        if length >= min_segment_meters:
            return bearing
    return fallback


def heading_diff_penalty(
    diff_deg: float | None,
    bands: Sequence[HeadingPenaltyBand] = HEADING_DIFF_PENALTY_BANDS,
) -> float:
    """방향차(°) → 0–1 패널티. 구간 안은 선형 보간. heading 없으면 0(중립)."""
    if diff_deg is None:
        return 0.0
    diff = max(0.0, min(180.0, float(diff_deg)))
    lower = 0.0
    prev_penalty = 0.0
    for band in bands:
        if diff <= band.upper_degrees:
            span = band.upper_degrees - lower
            t = 0.0 if span <= 0 else (diff - lower) / span
            return prev_penalty + t * (band.penalty - prev_penalty)
        prev_penalty = band.penalty
        lower = band.upper_degrees
    return bands[-1].penalty if bands else 1.0


def _heading_change_at(polyline: Sequence[Coordinate], index: int) -> float | None:
    if index <= 0 or index >= len(polyline) - 1:
        return None
    before = 0
    span = 0.0
    for i in range(index, 0, -1):
        span += distance_meters(polyline[i - 1], polyline[i])
        before = i - 1
        if span >= _TURN_HEADING_SPAN_METERS:
            break
    after = len(polyline) - 1
    span = 0.0
    for i in range(index, len(polyline) - 1):
        span += distance_meters(polyline[i], polyline[i + 1])
        after = i + 1
        if span >= _TURN_HEADING_SPAN_METERS:
            break
    if polyline[before] == polyline[index] or polyline[index] == polyline[after]:
        return None
    return angular_difference(
        bearing_degrees(polyline[before], polyline[index]),
        bearing_degrees(polyline[index], polyline[after]),
    )


def turn_angles_along_route(polyline: Sequence[Coordinate]) -> tuple[float, ...]:
    """경로상 유의미한 회전 각도 목록(지표 2-b/c)."""
    angles: list[float] = []
    for index in range(1, len(polyline) - 1):
        change = _heading_change_at(polyline, index)
        if change is not None and change >= MIN_TURN_HEADING_CHANGE_DEGREES:
            angles.append(change)
    return tuple(angles)


def polyline_length_meters(polyline: Sequence[Coordinate]) -> float:
    total = 0.0
    for i in range(len(polyline) - 1):
        total += distance_meters(polyline[i], polyline[i + 1])
    return total


def extract_route_metrics(
    route: RouteModel,
    *,
    user_heading_deg: float | None = None,
    total_distance_meters: float | None = None,
    quality: RouteQuality | None = None,
) -> RouteMetrics:
    """RouteModel(+기존 부가정보)에서 5지표를 읽는다."""
    quality = quality or RouteQuality()
    distance = (
        float(total_distance_meters)
        if total_distance_meters is not None and total_distance_meters > 0
        else polyline_length_meters(route.polyline)
    )
    bearing = initial_route_bearing_degrees(route.polyline)
    heading_diff: float | None = None
    if user_heading_deg is not None and bearing is not None:
        heading_diff = heading_difference_degrees(user_heading_deg, bearing)
    angles = quality.turn_angles_degrees or turn_angles_along_route(route.polyline)
    turn_count = len(route.turn_points) if route.turn_points else len(angles)
    return RouteMetrics(
        total_distance_meters=distance,
        initial_heading_diff_deg=heading_diff,
        initial_route_bearing_deg=bearing,
        turn_count=turn_count,
        turn_angles_degrees=angles,
        fork_count=quality.fork_count,
        sidewalk_ratio=quality.sidewalk_ratio,
        discomfort_count=quality.discomfort_count,
        discomfort_ratio=quality.discomfort_ratio,
    )


def _clamp01(value: float) -> float:
    return 0.0 if value < 0.0 else 1.0 if value > 1.0 else value


def _norm(value: float, ref: float) -> float:
    if ref <= 0:
        return 0.0
    return _clamp01(value / ref)


def turn_related_score(metrics: RouteMetrics, heading_penalty: float) -> float:
    """지표 2 비용: 초기 방향차 + 회전 횟수 + 회전 각도."""
    parts = DIRECTION_CHANGE_PART_WEIGHTS
    turn_count_cost = _norm(float(metrics.turn_count), TURN_COUNT_REF)
    angle_sum = sum(metrics.turn_angles_degrees)
    turn_angle_cost = _norm(angle_sum, TURN_ANGLE_SUM_REF_DEGREES)
    return (
        parts["initial_heading"] * heading_penalty
        + parts["turn_count"] * turn_count_cost
        + parts["turn_angle"] * turn_angle_cost
    )


def _sidewalk_cost(ratio: float | None) -> float:
    """보도 비율이 높을수록 비용↓. 값 없으면 중립(0) — 가짜 안전점수를 만들지 않는다."""
    if ratio is None:
        return 0.0
    return _clamp01(1.0 - float(ratio))


def _discomfort_cost(metrics: RouteMetrics) -> float:
    count_cost = _norm(float(metrics.discomfort_count), DISCOMFORT_COUNT_REF)
    ratio_cost = _clamp01(float(metrics.discomfort_ratio or 0.0))
    return max(count_cost, ratio_cost)


def route_cost(
    metrics: RouteMetrics,
    *,
    mode: str = DEFAULT_ROUTE_MODE,
    distance_ref_meters: float | None = None,
    weights: Mapping[str, ModeWeights] | None = None,
) -> tuple[float, float, float]:
    """(최종 비용, 방향바꿈 점수, heading 패널티). 낮을수록 추천."""
    table = weights or MODE_WEIGHTS
    w = table.get(mode, table[DEFAULT_ROUTE_MODE])
    dist_ref = distance_ref_meters if distance_ref_meters and distance_ref_meters > 0 else DISTANCE_REF_METERS
    dist_cost = _norm(metrics.total_distance_meters, dist_ref)
    h_pen = heading_diff_penalty(metrics.initial_heading_diff_deg)
    turn_score = turn_related_score(metrics, h_pen)
    fork_cost = _norm(float(metrics.fork_count), FORK_COUNT_REF)
    sidewalk_cost = _sidewalk_cost(metrics.sidewalk_ratio)
    discomfort = _discomfort_cost(metrics)
    total = (
        w.distance * dist_cost
        + w.direction_change * turn_score
        + w.fork * fork_cost
        + w.sidewalk * sidewalk_cost
        + w.discomfort * discomfort
    )
    return total, turn_score, h_pen


def quality_from_route_info(info: object | None) -> RouteQuality:
    """RouteInfo 에 붙은 품질 필드를 읽는다. 없으면 기본값."""
    if info is None:
        return RouteQuality()
    angles = getattr(info, "turn_angles_degrees", ()) or ()
    return RouteQuality(
        sidewalk_ratio=getattr(info, "sidewalk_ratio", None),
        fork_count=int(getattr(info, "fork_count", 0) or 0),
        discomfort_count=int(getattr(info, "discomfort_count", 0) or 0),
        discomfort_ratio=getattr(info, "discomfort_ratio", None),
        turn_angles_degrees=tuple(float(a) for a in angles),
    )


def score_candidate(
    route: RouteModel,
    info: object | None = None,
    *,
    user_heading_deg: float | None = None,
    mode: str = DEFAULT_ROUTE_MODE,
    distance_ref_meters: float | None = None,
    candidate_id: str | None = None,
) -> ScoredRoute:
    """후보 1개를 점수화하고 진단 필드를 붙인다."""
    total_distance = getattr(info, "total_distance_meters", None) if info is not None else None
    metrics = extract_route_metrics(
        route,
        user_heading_deg=user_heading_deg,
        total_distance_meters=float(total_distance) if total_distance else None,
        quality=quality_from_route_info(info),
    )
    cost, turn_score, h_pen = route_cost(
        metrics, mode=mode, distance_ref_meters=distance_ref_meters,
    )
    diag = {
        "mode": mode,
        "user_heading_deg": None if user_heading_deg is None else round(float(user_heading_deg), 1),
        "initial_route_bearing_deg": (
            None if metrics.initial_route_bearing_deg is None
            else round(metrics.initial_route_bearing_deg, 1)
        ),
        "initial_heading_diff_deg": (
            None if metrics.initial_heading_diff_deg is None
            else round(metrics.initial_heading_diff_deg, 1)
        ),
        "total_distance_m": round(metrics.total_distance_meters, 1),
        "turn_related_score": round(turn_score, 4),
        "final_route_score": round(cost, 4),
        "turn_count": metrics.turn_count,
        "fork_count": metrics.fork_count,
        "sidewalk_ratio": metrics.sidewalk_ratio,
        "discomfort_count": metrics.discomfort_count,
    }
    if candidate_id is not None:
        diag["candidate_id"] = candidate_id
    return ScoredRoute(
        route=route,
        info=info,
        metrics=metrics,
        mode=mode,
        cost=cost,
        turn_related_score=turn_score,
        heading_penalty=h_pen,
        diag=diag,
    )


def rank_routes(
    candidates: Sequence[tuple[RouteModel, object | None]],
    *,
    user_heading_deg: float | None,
    mode: str = DEFAULT_ROUTE_MODE,
) -> list[ScoredRoute]:
    """같은 후보 세트를 모드 가중치로 점수화해 비용 오름차순으로 반환한다."""
    if not candidates:
        return []
    distances = []
    for route, info in candidates:
        listed = getattr(info, "total_distance_meters", None) if info is not None else None
        distances.append(
            float(listed) if listed and listed > 0 else polyline_length_meters(route.polyline)
        )
    dist_ref = max(distances) if distances else DISTANCE_REF_METERS
    scored = [
        score_candidate(
            route,
            info,
            user_heading_deg=user_heading_deg,
            mode=mode,
            distance_ref_meters=dist_ref,
            candidate_id=str(i),
        )
        for i, (route, info) in enumerate(candidates)
    ]
    scored.sort(key=lambda item: item.cost)
    return scored


def select_best_route(
    candidates: Sequence[tuple[RouteModel, object | None]],
    *,
    user_heading_deg: float | None,
    mode: str = DEFAULT_ROUTE_MODE,
) -> ScoredRoute | None:
    ranked = rank_routes(candidates, user_heading_deg=user_heading_deg, mode=mode)
    return ranked[0] if ranked else None


def route_score_diag_payload(
    winner: ScoredRoute,
    ranked: Sequence[ScoredRoute] | None = None,
    *,
    user_heading_deg: float | None = None,
) -> dict:
    """walk_diag 에 넣을 필드. 좌표·목적지는 넣지 않는다."""
    payload = dict(winner.diag)
    if user_heading_deg is not None:
        payload["user_heading_deg"] = round(float(user_heading_deg), 1)
    if ranked:
        payload["candidates"] = [
            {
                "id": item.diag.get("candidate_id"),
                "total_distance_m": item.diag.get("total_distance_m"),
                "initial_heading_diff_deg": item.diag.get("initial_heading_diff_deg"),
                "turn_related_score": item.diag.get("turn_related_score"),
                "final_route_score": item.diag.get("final_route_score"),
            }
            for item in ranked
        ]
    return payload
