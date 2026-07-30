"""랜드마크 모델·후보 점수·안내 템플릿 검증."""

import os
import sys
from dataclasses import replace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import Coordinate, RouteModel, TurnPoint
from landmarks import (
    Landmark,
    build_landmark_instruction,
    landmark_completeness,
    landmark_relative_position,
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


def test_temporarily_unavailable_is_not_a_candidate():
    item = landmark("temp", "공사중", "building", 37.56649, 126.97802)
    blocked = replace(item, status="temporarily_unavailable")
    assert score_landmark_for_turn(blocked, ROUTE, ROUTE.turn_points[0]) is None


def test_empty_visible_from_degrees_uses_neutral_direction_match():
    item = landmark(
        "neutral", "중립", "building", 37.56649, 126.97802, visible_from_degrees=[]
    )
    scored = score_landmark_for_turn(item, ROUTE, ROUTE.turn_points[0])
    assert scored is not None
    assert scored.direction_match_score == 0.5


def test_relative_position_covers_cardinal_and_ordinal_labels():
    origin = Coordinate(37.5660, 126.9780)
    north = landmark("n", "북", "building", 37.5670, 126.9780)
    east = landmark("e", "동", "building", 37.5660, 126.9790)
    assert landmark_relative_position(origin, north) == "북쪽"
    assert landmark_relative_position(origin, east) == "동쪽"


def test_instruction_particle_and_straight_template():
    store = score_landmark_for_turn(
        landmark("cafe", "이디야", "cafe", 37.56649, 126.97801),
        ROUTE,
        replace(ROUTE.turn_points[0], direction="straight"),
    )
    assert store is not None
    assert build_landmark_instruction(store) == "이디야를 지나 계속 직진하세요."


def test_demo_draft_landmarks_produce_no_guidance():
    drafts = [
        landmark(
            "demo-a", "데모A", "building", 37.56649, 126.97802,
            status="draft", source="demo_seed_needs_field_verification",
        ),
        landmark(
            "demo-b", "데모B", "building", 37.56651, 126.97858,
            status="draft", source="demo_seed_needs_field_verification",
        ),
    ]
    assert select_landmark_guidance(ROUTE, drafts) == {}


def test_completeness_flags_missing_field_items_and_non_field_source():
    incomplete = landmark(
        "x", "미완", "building", 37.56649, 126.97802,
        status="draft", source="demo_seed_needs_field_verification",
        entrance_description="", photo_url="", visible_from_degrees=[],
    )
    report = landmark_completeness(incomplete)
    assert report["complete"] is False
    assert "entrance_description" in report["missing"]
    assert report["non_field_source"] is True

    complete = landmark(
        "y", "완비", "building", 37.56649, 126.97802,
        entrance_description="정문",
        photo_url="photo.jpg",
        photo_alt="정면",
        visible_from_degrees=[0],
        source="field_manual",
    )
    assert landmark_completeness(complete)["ready_for_approval"] is True


def test_synthetic_fixture_ranking_is_stable():
    """합성 좌표  orthodrome — 실장소 승인 데이터가 아님."""
    building = landmark(
        "syn-building",
        "합성 건물",
        "building",
        37.56649,
        126.97802,
        visibility_score=0.95,
        permanence_score=0.95,
        distinctiveness_score=0.9,
        entrance_description="정문",
        photo_url="synthetic.webp",
        source="synthetic_fixture",
    )
    store = landmark(
        "syn-store",
        "합성 편의점",
        "convenience_store",
        37.56648,
        126.97801,
        visibility_score=0.5,
        permanence_score=0.4,
        distinctiveness_score=0.4,
        source="synthetic_fixture",
    )
    ranked = rank_landmarks_for_turn([store, building], ROUTE, ROUTE.turn_points[0])
    assert [item.landmark.id for item in ranked] == ["syn-building", "syn-store"]
    assert ranked[0].total_score > ranked[1].total_score
