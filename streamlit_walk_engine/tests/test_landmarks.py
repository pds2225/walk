"""랜드마크 모델·후보 점수·안내 템플릿 검증."""

import os
import sys
from dataclasses import replace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import Coordinate, RouteModel, TurnPoint
from landmarks import (
    Landmark,
    build_landmark_instruction,
    rank_landmarks_for_turn,
    score_landmark_for_turn,
    select_landmark_guidance,
)


ROUTE = RouteModel(
    polyline=(
        Coordinate(37.5660, 126.9780),
        Coordinate(37.5665, 126.9780),
        Coordinate(37.5665, 126.9786),
        Coordinate(37.5670, 126.9786),
    ),
    turn_points=(
        TurnPoint("turn-1", Coordinate(37.5665, 126.9780), 1, "right"),
        TurnPoint("turn-2", Coordinate(37.5665, 126.9786), 2, "left"),
    ),
)


def landmark(
    landmark_id: str,
    name: str,
    category: str,
    latitude: float,
    longitude: float,
    **overrides,
) -> Landmark:
    values = {
        "id": landmark_id,
        "name": name,
        "category": category,
        "latitude": latitude,
        "longitude": longitude,
        "visibility_score": 0.8,
        "permanence_score": 0.8,
        "distinctiveness_score": 0.8,
        "visible_from_degrees": [0],
        "source": "test",
        "verified_at": "2026-07-28",
        "status": "approved",
    }
    values.update(overrides)
    return Landmark.from_dict(values)


def test_model_roundtrip_preserves_required_navigation_fields():
    original = landmark(
        "station-1",
        "시청역 1번 출구",
        "station_exit",
        37.56649,
        126.97802,
        entrance_description="엘리베이터 옆 출구",
        photo_url="data/photo.webp",
        accessibility_tags=["elevator", "step_free"],
    )
    restored = Landmark.from_dict(original.to_dict())
    assert restored == original


def test_draft_closed_and_far_landmarks_are_not_candidates():
    approved = landmark("ok", "공공건물", "building", 37.56649, 126.97802)
    assert score_landmark_for_turn(approved, ROUTE, ROUTE.turn_points[0]) is not None
    assert score_landmark_for_turn(
        replace(approved, status="draft"), ROUTE, ROUTE.turn_points[0]
    ) is None
    assert score_landmark_for_turn(
        replace(approved, status="closed"), ROUTE, ROUTE.turn_points[0]
    ) is None
    far = replace(approved, id="far", coordinate=Coordinate(37.58, 127.0))
    assert score_landmark_for_turn(far, ROUTE, ROUTE.turn_points[0]) is None


def test_direction_visibility_changes_score():
    visible = landmark("visible", "보이는 건물", "building", 37.56649, 126.97802)
    hidden = replace(visible, id="hidden", name="등진 건물", visible_from_degrees=(180.0,))
    visible_score = score_landmark_for_turn(visible, ROUTE, ROUTE.turn_points[0])
    hidden_score = score_landmark_for_turn(hidden, ROUTE, ROUTE.turn_points[0])
    assert visible_score is not None and hidden_score is not None
    assert visible_score.direction_match_score > hidden_score.direction_match_score
    assert visible_score.total_score > hidden_score.total_score


def test_convenience_store_is_not_unconditionally_prioritized():
    building = landmark(
        "building", "시청 본관", "building", 37.56649, 126.97802,
        visibility_score=0.95, permanence_score=0.98, distinctiveness_score=0.95,
        entrance_description="정문", photo_url="photo.webp",
    )
    store = landmark(
        "store", "CU편의점", "convenience_store", 37.56649, 126.97801,
        visibility_score=0.55, permanence_score=0.45, distinctiveness_score=0.45,
    )
    ranked = rank_landmarks_for_turn([store, building], ROUTE, ROUTE.turn_points[0])
    assert [candidate.landmark.id for candidate in ranked] == ["building", "store"]


def test_instruction_templates_cover_pass_turn_photo_and_entrance_style():
    store_candidate = score_landmark_for_turn(
        landmark("store", "CU편의점", "convenience_store", 37.56649, 126.97801),
        ROUTE,
        ROUTE.turn_points[0],
    )
    building_candidate = score_landmark_for_turn(
        landmark(
            "hall", "시청", "public_facility", 37.56649, 126.97802,
            entrance_description="정문",
        ),
        ROUTE,
        ROUTE.turn_points[0],
    )
    assert store_candidate is not None and building_candidate is not None
    assert build_landmark_instruction(store_candidate) == "CU편의점을 지나 오른쪽으로 도세요."
    assert build_landmark_instruction(building_candidate) == "시청 정문 앞에서 오른쪽으로 도세요."


def test_route_guidance_avoids_reusing_one_landmark_for_multiple_turns():
    first = landmark("first", "첫 건물", "building", 37.56649, 126.97802)
    second = landmark("second", "두 번째 건물", "building", 37.56651, 126.97858)
    guidance = select_landmark_guidance(ROUTE, [first, second])
    assert set(guidance) == {"turn-1", "turn-2"}
    assert len({item.candidate.landmark.id for item in guidance.values()}) == 2
