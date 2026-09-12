"""랜드마크 JSON 저장소와 승인 이력.

기본 운영 데이터는 gitignore 된 ``landmarks.local.json``이다. 파일이 없을 때만
검수 전 데모 데이터를 읽어 관리 화면에서 편집·승인할 수 있게 한다.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from landmarks import Landmark, is_non_field_source, landmark_completeness

_DATA_DIR = Path(__file__).resolve().parent / "data"
_DEMO_PATH = _DATA_DIR / "landmarks.demo.json"
_LOCAL_PATH = _DATA_DIR / "landmarks.local.json"
_SAFE_ID_RE = re.compile(r"[^0-9A-Za-z가-힣_-]+")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_landmark_id(value: str) -> str:
    normalized = _SAFE_ID_RE.sub("-", str(value).strip()).strip("-_")
    if not normalized:
        raise ValueError("랜드마크 ID에 사용할 수 있는 문자가 없습니다.")
    return normalized[:80]


def default_data_path() -> Path:
    configured = os.environ.get("WALK_LANDMARK_DATA", "").strip()
    return Path(configured).expanduser() if configured else _LOCAL_PATH


def demo_data_path() -> Path:
    return _DEMO_PATH


def default_photo_dir() -> Path:
    return _DATA_DIR / "landmark_photos"


class LandmarkRepository:
    def __init__(
        self,
        path: Optional[Path] = None,
        *,
        demo_fallback_path: Optional[Path] = _DEMO_PATH,
    ) -> None:
        self.path = Path(path) if path is not None else default_data_path()
        self.demo_fallback_path = (
            Path(demo_fallback_path) if demo_fallback_path is not None else None
        )

    @property
    def history_path(self) -> Path:
        return self.path.with_name(f"{self.path.stem}.history.jsonl")

    def _read_path(self) -> Optional[Path]:
        if self.path.is_file():
            return self.path
        if self.demo_fallback_path is not None and self.demo_fallback_path.is_file():
            return self.demo_fallback_path
        return None

    def load(self) -> list[Landmark]:
        source = self._read_path()
        if source is None:
            return []
        with source.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        values = payload.get("landmarks", payload) if isinstance(payload, dict) else payload
        if not isinstance(values, list):
            raise ValueError("랜드마크 JSON은 목록이어야 합니다.")
        landmarks = [Landmark.from_dict(value) for value in values if isinstance(value, dict)]
        ids = [landmark.id for landmark in landmarks]
        if len(ids) != len(set(ids)):
            raise ValueError("랜드마크 ID가 중복되었습니다.")
        return landmarks

    def save(self, landmarks: list[Landmark]) -> None:
        ids = [landmark.id for landmark in landmarks]
        if len(ids) != len(set(ids)):
            raise ValueError("랜드마크 ID가 중복되었습니다.")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "schema_version": 1,
            "landmarks": [
                landmark.to_dict()
                for landmark in sorted(landmarks, key=lambda item: item.id)
            ],
        }
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f"{self.path.stem}.",
            suffix=".tmp",
            dir=str(self.path.parent),
        )
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            Path(temporary_name).replace(self.path)
        except Exception:
            Path(temporary_name).unlink(missing_ok=True)
            raise

    def list_approved(self) -> list[Landmark]:
        return [item for item in self.load() if item.status == "approved"]

    def completeness_report(self) -> list[dict[str, Any]]:
        return [
            {"id": item.id, "name": item.name, "status": item.status, **landmark_completeness(item)}
            for item in self.load()
        ]

    def upsert(
        self,
        landmark: Landmark,
        *,
        actor: str = "local_admin",
        allow_non_field_approval: bool = False,
        allow_incomplete_approval: bool = False,
    ) -> Landmark:
        now = utc_now_iso()
        normalized = replace(
            landmark,
            id=normalize_landmark_id(landmark.id),
            updated_at=now,
            verified_at=(landmark.verified_at or now)
            if landmark.status == "approved"
            else landmark.verified_at,
        )
        if normalized.status == "approved":
            completeness = landmark_completeness(normalized)
            if is_non_field_source(normalized.source) and not allow_non_field_approval:
                raise ValueError(
                    "데모·합성 출처 랜드마크는 명시적 허용 없이 approved 로 저장할 수 없습니다."
                )
            if not completeness["complete"] and not allow_incomplete_approval:
                missing = ", ".join(completeness["missing"])
                raise ValueError(
                    f"승인 전 필수 항목이 비어 있습니다: {missing}"
                )
        landmarks = self.load()
        previous = next((item for item in landmarks if item.id == normalized.id), None)
        updated = [
            normalized if item.id == normalized.id else item for item in landmarks
        ]
        if previous is None:
            updated.append(normalized)
        self.save(updated)
        self._append_history(
            {
                "timestamp": now,
                "landmark_id": normalized.id,
                "actor": str(actor or "local_admin")[:80],
                "action": "created" if previous is None else "updated",
                "from_status": previous.status if previous is not None else None,
                "to_status": normalized.status,
            }
        )
        return normalized

    def _append_history(self, event: dict[str, Any]) -> None:
        self.history_path.parent.mkdir(parents=True, exist_ok=True)
        with self.history_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")

    def load_history(self, limit: int = 100) -> list[dict[str, Any]]:
        if not self.history_path.is_file():
            return []
        events: list[dict[str, Any]] = []
        with self.history_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                try:
                    value = json.loads(line)
                except ValueError:
                    continue
                if isinstance(value, dict):
                    events.append(value)
        return events[-max(0, int(limit)):]
