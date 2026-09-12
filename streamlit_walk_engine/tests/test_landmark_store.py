"""랜드마크 JSON 저장·수정·승인 이력 검증."""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from landmark_store import LandmarkRepository, normalize_landmark_id
from landmarks import Landmark


def _landmark(landmark_id: str, status: str = "draft") -> Landmark:
    return Landmark.from_dict({
        "id": landmark_id,
        "name": "테스트 건물",
        "category": "building",
        "latitude": 37.5665,
        "longitude": 126.9780,
        "status": status,
        "source": "field",
    })


def test_repository_save_load_and_atomic_json_shape(tmp_path):
    path = tmp_path / "landmarks.json"
    repository = LandmarkRepository(path, demo_fallback_path=None)
    repository.save([_landmark("b"), _landmark("a")])
    assert [item.id for item in repository.load()] == ["a", "b"]
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["schema_version"] == 1
    assert [item["id"] for item in payload["landmarks"]] == ["a", "b"]
    assert not list(tmp_path.glob("*.tmp"))


def test_upsert_creates_updates_and_records_approval_history(tmp_path):
    repository = LandmarkRepository(tmp_path / "landmarks.json", demo_fallback_path=None)
    created = repository.upsert(_landmark("test place"), actor="field-user")
    assert created.id == "test-place"
    assert created.updated_at
    approved = Landmark.from_dict({
        **created.to_dict(),
        "status": "approved",
        "entrance_description": "정문",
        "visible_from_degrees": [0],
        "photo_url": "data/landmark_photos/test.webp",
        "photo_alt": "정면 사진",
        "source": "field_manual",
    })
    saved = repository.upsert(approved, actor="reviewer")
    assert saved.verified_at
    assert repository.load()[0].status == "approved"
    assert [item.id for item in repository.list_approved()] == ["test-place"]
    history = repository.load_history()
    assert [event["action"] for event in history] == ["created", "updated"]
    assert history[-1]["from_status"] == "draft"
    assert history[-1]["to_status"] == "approved"


def test_approval_rejects_incomplete_and_non_field_sources(tmp_path):
    repository = LandmarkRepository(tmp_path / "landmarks.json", demo_fallback_path=None)
    incomplete = Landmark.from_dict({
        **_landmark("gate").to_dict(),
        "status": "approved",
        "source": "field_manual",
    })
    try:
        repository.upsert(incomplete)
    except ValueError as exc:
        assert "필수 항목" in str(exc)
    else:
        raise AssertionError("incomplete approval must fail")

    synthetic = Landmark.from_dict({
        **_landmark("synth").to_dict(),
        "status": "approved",
        "entrance_description": "입구",
        "visible_from_degrees": [90],
        "photo_url": "photo.jpg",
        "photo_alt": "alt",
        "source": "synthetic_test_only",
    })
    try:
        repository.upsert(synthetic)
    except ValueError as exc:
        assert "데모·합성" in str(exc)
    else:
        raise AssertionError("synthetic approval must fail")

    saved = repository.upsert(synthetic, allow_non_field_approval=True)
    assert saved.status == "approved"


def test_walk_landmark_data_env_override(tmp_path, monkeypatch):
    path = tmp_path / "custom.json"
    monkeypatch.setenv("WALK_LANDMARK_DATA", str(path))
    from landmark_store import LandmarkRepository as FreshRepo
    from landmark_store import default_data_path

    assert default_data_path() == path
    repository = FreshRepo(demo_fallback_path=None)
    repository.save([_landmark("env")])
    assert path.is_file()
    assert repository.load()[0].id == "env"


def test_demo_fallback_does_not_write_until_admin_saves(tmp_path):
    demo_path = tmp_path / "demo.json"
    demo_path.write_text(json.dumps({
        "landmarks": [_landmark("demo").to_dict()],
    }, ensure_ascii=False), encoding="utf-8")
    local_path = tmp_path / "local.json"
    repository = LandmarkRepository(local_path, demo_fallback_path=demo_path)
    assert repository.load()[0].id == "demo"
    assert not local_path.exists()


def test_duplicate_ids_are_rejected(tmp_path):
    repository = LandmarkRepository(tmp_path / "landmarks.json", demo_fallback_path=None)
    try:
        repository.save([_landmark("same"), _landmark("same")])
    except ValueError as exc:
        assert "중복" in str(exc)
    else:
        raise AssertionError("duplicate IDs must fail")


def test_id_normalization_rejects_empty_and_keeps_korean():
    assert normalize_landmark_id(" 서울 시청 / 정문 ") == "서울-시청-정문"
    try:
        normalize_landmark_id("!!!")
    except ValueError:
        pass
    else:
        raise AssertionError("empty normalized ID must fail")
