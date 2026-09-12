"""랜드마크 도메인 모델과 규칙 기반 경로 기준점 선정 엔진.

외부 API나 LLM 없이 동작한다. 검수 승인된 랜드마크만 실제 안내 후보로 사용하며,
편의점이라는 이유만으로 우선하지 않고 회전점 거리·진행 방향·가시성·영속성·식별성을
함께 점수화한다.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Iterable, Literal, Optional

from engine import (
    Coordinate,
    RouteModel,
    TurnPoint,
    angular_difference,
    bearing_degrees,
    distance_meters,
    point_to_polyline_distance_meters,
    prepare_route,
)

LandmarkStatus = Literal["draft", "approved", "temporarily_unavailable", "closed"]
LandmarkCategory = Literal[
    "building",
    "station_exit",
    "public_facility",
    "large_sign",
    "convenience_store",
    "pharmacy",
    "cafe",
    "other",
]

LANDMARK_CATEGORIES: tuple[str, ...] = (
    "building",
    "station_exit",
    "public_facility",
    "large_sign",
    "convenience_store",
    "pharmacy",
    "cafe",
    "other",
)
LANDMARK_STATUSES: tuple[str, ...] = (
    "draft",
    "approved",
    "temporarily_unavailable",
    "closed",
)

_CATEGORY_STABILITY = {
    "station_exit": 0.95,
    "public_facility": 0.92,
    "building": 0.88,
    "large_sign": 0.70,
    "pharmacy": 0.65,
    "convenience_store": 0.62,
    "other": 0.55,
    "cafe": 0.48,
}


def _score(value: Any, default: float = 0.5) -> float:
    try:
        return min(1.0, max(0.0, float(value)))
    except (TypeError, ValueError):
        return default


def _coordinate(latitude: Any, longitude: Any) -> Coordinate:
    lat, lon = float(latitude), float(longitude)
    if not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise ValueError("랜드마크 좌표 범위가 올바르지 않습니다.")
    return Coordinate(latitude=lat, longitude=lon)


@dataclass(frozen=True)
class Landmark:
    id: str
    name: str
    category: LandmarkCategory
    coordinate: Coordinate
    entrance_description: str = ""
    photo_url: str = ""
    photo_alt: str = ""
    visible_from_degrees: tuple[float, ...] = ()
    visibility_score: float = 0.5
    permanence_score: float = 0.5
    distinctiveness_score: float = 0.5
    accessibility_tags: tuple[str, ...] = ()
    source: str = ""
    verified_at: str = ""
    status: LandmarkStatus = "draft"
    condition_notes: str = ""
    updated_at: str = ""

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "Landmark":
        landmark_id = str(value.get("id", "")).strip()
        name = str(value.get("name", "")).strip()
        if not landmark_id or not name:
            raise ValueError("랜드마크 ID와 명칭은 필수입니다.")
        category = str(value.get("category", "other"))
        status = str(value.get("status", "draft"))
        if category not in LANDMARK_CATEGORIES:
            raise ValueError(f"지원하지 않는 랜드마크 분류입니다: {category}")
        if status not in LANDMARK_STATUSES:
            raise ValueError(f"지원하지 않는 검수 상태입니다: {status}")
        coordinate_value = value.get("coordinate") or {}
        latitude = value.get("latitude", coordinate_value.get("latitude"))
        longitude = value.get("longitude", coordinate_value.get("longitude"))
        visible = tuple(
            float(item) % 360 for item in (value.get("visible_from_degrees") or ())
        )
        return cls(
            id=landmark_id,
            name=name,
            category=category,  # type: ignore[arg-type]
            coordinate=_coordinate(latitude, longitude),
            entrance_description=str(value.get("entrance_description", "")).strip(),
            photo_url=str(value.get("photo_url", "")).strip(),
            photo_alt=str(value.get("photo_alt", "")).strip(),
            visible_from_degrees=visible,
            visibility_score=_score(value.get("visibility_score")),
            permanence_score=_score(value.get("permanence_score")),
            distinctiveness_score=_score(value.get("distinctiveness_score")),
            accessibility_tags=tuple(
                str(item).strip()
                for item in (value.get("accessibility_tags") or ())
                if str(item).strip()
            ),
            source=str(value.get("source", "")).strip(),
            verified_at=str(value.get("verified_at", "")).strip(),
            status=status,  # type: ignore[arg-type]
            condition_notes=str(value.get("condition_notes", "")).strip(),
            updated_at=str(value.get("updated_at", "")).strip(),
        )

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        coordinate = value.pop("coordinate")
        value["latitude"] = coordinate["latitude"]
        value["longitude"] = coordinate["longitude"]
        value["visible_from_degrees"] = list(self.visible_from_degrees)
        value["accessibility_tags"] = list(self.accessibility_tags)
        return value


@dataclass(frozen=True)
class LandmarkCandidate:
    landmark: Landmark
    turn_point_id: str
    turn_direction: str
    distance_to_turn_meters: float
    distance_to_route_meters: float
    direction_match_score: float
    turn_importance_score: float
    total_score: float
    score_reasons: tuple[str, ...]


@dataclass(frozen=True)
class LandmarkGuidance:
    candidate: LandmarkCandidate
    instruction: str


def _direction_match(landmark: Landmark, approach_heading_degrees: float) -> float:
    if not landmark.visible_from_degrees:
        return 0.5
    difference = min(
        angular_difference(approach_heading_degrees, heading)
        for heading in landmark.visible_from_degrees
    )
    return max(0.0, 1.0 - difference / 120.0)


def score_landmark_for_turn(
    landmark: Landmark,
    route: RouteModel,
    turn_point: TurnPoint,
    *,
    max_turn_distance_meters: float = 60.0,
    max_route_distance_meters: float = 40.0,
) -> Optional[LandmarkCandidate]:
    """랜드마크 한 개를 특정 회전점 기준으로 평가한다."""
    if landmark.status != "approved":
        return None
    distance_to_turn = distance_meters(landmark.coordinate, turn_point.coordinate)
    if distance_to_turn > max_turn_distance_meters:
        return None
    distance_to_route, _, _ = point_to_polyline_distance_meters(
        landmark.coordinate, route.polyline
    )
    if distance_to_route > max_route_distance_meters:
        return None

    prepared = prepare_route(route)
    prepared_turn = next(
        item for item in prepared.turn_points if item.id == turn_point.id
    )
    direction_match = _direction_match(
        landmark, prepared_turn.approach_heading_degrees
    )
    turn_importance = 1.0 if turn_point.direction in ("left", "right") else 0.4
    turn_distance_score = max(0.0, 1.0 - distance_to_turn / max_turn_distance_meters)
    route_distance_score = max(0.0, 1.0 - distance_to_route / max_route_distance_meters)
    category_stability = _CATEGORY_STABILITY.get(landmark.category, 0.5)
    permanence = (landmark.permanence_score + category_stability) / 2.0
    evidence_score = (
        (0.5 if landmark.photo_url else 0.0)
        + (0.5 if landmark.entrance_description else 0.0)
    )
    total = (
        0.18 * turn_distance_score
        + 0.10 * route_distance_score
        + 0.17 * direction_match
        + 0.15 * landmark.visibility_score
        + 0.13 * permanence
        + 0.12 * landmark.distinctiveness_score
        + 0.10 * turn_importance
        + 0.05 * evidence_score
    )
    reasons = (
        f"회전점 {distance_to_turn:.0f}m",
        f"경로 {distance_to_route:.0f}m",
        f"방향 일치 {direction_match:.2f}",
        f"가시성 {landmark.visibility_score:.2f}",
        f"영속성 {permanence:.2f}",
        f"식별성 {landmark.distinctiveness_score:.2f}",
    )
    return LandmarkCandidate(
        landmark=landmark,
        turn_point_id=turn_point.id,
        turn_direction=turn_point.direction,
        distance_to_turn_meters=distance_to_turn,
        distance_to_route_meters=distance_to_route,
        direction_match_score=direction_match,
        turn_importance_score=turn_importance,
        total_score=round(total, 4),
        score_reasons=reasons,
    )


def rank_landmarks_for_turn(
    landmarks: Iterable[Landmark],
    route: RouteModel,
    turn_point: TurnPoint,
) -> list[LandmarkCandidate]:
    candidates = [
        candidate
        for landmark in landmarks
        if (candidate := score_landmark_for_turn(landmark, route, turn_point)) is not None
    ]
    return sorted(
        candidates,
        key=lambda item: (
            -item.total_score,
            item.distance_to_turn_meters,
            item.landmark.name,
        ),
    )


def _object_particle(word: str) -> str:
    if not word:
        return "을"
    code = ord(word[-1])
    if 0xAC00 <= code <= 0xD7A3:
        return "을" if (code - 0xAC00) % 28 else "를"
    return "을"


def build_landmark_instruction(candidate: LandmarkCandidate) -> str:
    landmark = candidate.landmark
    action = {
        "left": "왼쪽으로 도세요",
        "right": "오른쪽으로 도세요",
        "straight": "계속 직진하세요",
    }.get(candidate.turn_direction, "경로를 따라가세요")
    if landmark.category in {"convenience_store", "pharmacy", "cafe", "large_sign"}:
        phrase = f"{landmark.name}{_object_particle(landmark.name)} 지나 {action}."
    else:
        entrance = f" {landmark.entrance_description}" if landmark.entrance_description else ""
        phrase = f"{landmark.name}{entrance} 앞에서 {action}."
    return phrase


def select_landmark_guidance(
    route: RouteModel,
    landmarks: Iterable[Landmark],
) -> dict[str, LandmarkGuidance]:
    """각 회전점에 중복되지 않는 최적 랜드마크 한 개를 배정한다."""
    landmark_list = tuple(landmarks)
    guidance: dict[str, LandmarkGuidance] = {}
    used_landmark_ids: set[str] = set()
    for turn_point in sorted(route.turn_points, key=lambda item: item.route_index):
        ranked = rank_landmarks_for_turn(landmark_list, route, turn_point)
        selected = next(
            (
                candidate
                for candidate in ranked
                if candidate.landmark.id not in used_landmark_ids
            ),
            None,
        )
        if selected is None:
            continue
        used_landmark_ids.add(selected.landmark.id)
        guidance[turn_point.id] = LandmarkGuidance(
            candidate=selected,
            instruction=build_landmark_instruction(selected),
        )
    return guidance


def landmark_relative_position(origin: Coordinate, landmark: Landmark) -> str:
    """현재 위치에서 랜드마크까지의 대략 방향을 8방위 한국어로 반환한다."""
    bearing = bearing_degrees(origin, landmark.coordinate)
    labels = ("북쪽", "북동쪽", "동쪽", "남동쪽", "남쪽", "남서쪽", "서쪽", "북서쪽")
    return labels[int((bearing + 22.5) // 45) % 8]


_NON_FIELD_SOURCE_MARKERS = (
    "demo_seed",
    # POI 자동 수집분 — 좌표·이름만 있고 가시성·보이는 방향은 모른다.
    # 현장에서 눈으로 확인한 뒤에만 승인할 수 있게 여기서 막는다.
    "poi_auto",
    "synthetic_demo",
    "synthetic_test",
    "synthetic_fixture",
)


def is_non_field_source(source: str) -> bool:
    """데모·합성 출처인지 판별한다. 현장 승인 데이터로 취급하면 안 된다."""
    normalized = str(source or "").strip().lower().replace("-", "_")
    return any(marker in normalized for marker in _NON_FIELD_SOURCE_MARKERS)


def landmark_completeness(landmark: Landmark) -> dict[str, Any]:
    """현장 승인 전에 채워야 할 필수 항목을 점검한다."""
    missing: list[str] = []
    if not landmark.entrance_description:
        missing.append("entrance_description")
    if not landmark.visible_from_degrees:
        missing.append("visible_from_degrees")
    if not landmark.photo_url:
        missing.append("photo_url")
    elif not landmark.photo_alt:
        missing.append("photo_alt")
    if not landmark.source:
        missing.append("source")
    non_field = is_non_field_source(landmark.source)
    ready = not missing and not non_field
    return {
        "complete": not missing,
        "ready_for_approval": ready,
        "missing": tuple(missing),
        "non_field_source": non_field,
    }
