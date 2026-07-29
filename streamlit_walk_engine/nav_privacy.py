"""Navigation 브라우저 저장소와 개인정보 동의 정책의 순수 함수.

Streamlit UI는 이 모듈이 만든 설정과 JavaScript만 렌더한다. GPS 좌표가 들어가는
마지막 위치·활성 안내·진단 로그 저장은 명시적 동의가 없으면 모두 꺼진다.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Any, Iterable

from walk_diag import DEFAULT_DIAG_RETENTION_HOURS, normalized_retention_hours

LS_KEY_HISTORY = "walk_navi_history"
LS_KEY_BOOKINGS = "walk_navi_booking_history"
LS_KEY_FAVORITES = "walk_navi_favorites"
LS_KEY_LASTFIX = "walk_navi_last_fix"
LS_KEY_DIAG = "walk_navi_diag_log"
LS_KEY_ACTIVE = "walk_navi_active_session"
LS_KEY_PRIVACY = "walk_navi_privacy_settings"

PERSONAL_STORAGE_KEYS = (
    LS_KEY_HISTORY,
    LS_KEY_BOOKINGS,
    LS_KEY_FAVORITES,
    LS_KEY_LASTFIX,
    LS_KEY_DIAG,
    LS_KEY_ACTIVE,
    LS_KEY_PRIVACY,
)


@dataclass(frozen=True)
class PrivacySettings:
    location_storage: bool = False
    diag_consent: bool = False
    diag_enabled: bool = False
    diag_persist: bool = False
    diag_include_coarse_location: bool = False
    diag_retention_hours: int = DEFAULT_DIAG_RETENTION_HOURS

    @classmethod
    def from_mapping(cls, value: Any) -> "PrivacySettings":
        if not isinstance(value, dict):
            return cls()
        consent = bool(value.get("diag_consent", False))
        enabled = consent and bool(value.get("diag_enabled", False))
        return cls(
            location_storage=bool(value.get("location_storage", False)),
            diag_consent=consent,
            diag_enabled=enabled,
            diag_persist=enabled and bool(value.get("diag_persist", False)),
            diag_include_coarse_location=(
                enabled and bool(value.get("diag_include_coarse_location", False))
            ),
            diag_retention_hours=normalized_retention_hours(
                value.get("diag_retention_hours", DEFAULT_DIAG_RETENTION_HOURS)
            ),
        )

    @classmethod
    def from_json(cls, raw: str) -> "PrivacySettings":
        try:
            return cls.from_mapping(json.loads(raw))
        except (TypeError, ValueError):
            return cls()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, separators=(",", ":"))


def storage_set_script(key: str, value: str) -> str:
    """문자열 값을 localStorage에 안전하게 저장하는 script 본문."""
    return (
        "<script>try{localStorage.setItem("
        f"{json.dumps(str(key))},{json.dumps(str(value))}"
        ")}catch(e){}</script>"
    )


def storage_remove_script(keys: Iterable[str]) -> str:
    """지정 키만 정확히 지우는 script 본문."""
    statements = "".join(
        f"localStorage.removeItem({json.dumps(str(key))});" for key in keys
    )
    return f"<script>try{{{statements}}}catch(e){{}}</script>"


def personal_storage_remove_script() -> str:
    return storage_remove_script(PERSONAL_STORAGE_KEYS)
