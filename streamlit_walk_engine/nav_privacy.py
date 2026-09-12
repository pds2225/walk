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
    consent_ack: bool = False
    """동의 화면에서 사용자가 [동의]/[동의하지 않음]을 눌러 선택을 마쳤는지."""

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
            consent_ack=bool(value.get("consent_ack", False)),
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


def auto_checked_settings() -> PrivacySettings:
    """동의 화면에 미리 체크된 상태로 보여줄 값.

    저장되는 기본값(PrivacySettings())은 여전히 전부 OFF다. 이 값은 아직 아무것도
    저장하지 않은 상태에서 화면에만 채워 두는 제안값이고, 사용자가 [동의]를 눌러야
    실제 설정으로 반영된다. 체크를 풀고 눌러도 되고, [동의하지 않음]이면 전부 OFF다.
    """
    return PrivacySettings(
        location_storage=True,
        diag_consent=True,
        diag_enabled=True,
        diag_persist=True,
        diag_include_coarse_location=True,
        diag_retention_hours=DEFAULT_DIAG_RETENTION_HOURS,
        consent_ack=False,
    )


def declined_settings() -> PrivacySettings:
    """[동의하지 않음] 결과 — 수집·저장은 전부 OFF, 선택만 기록한다."""
    return PrivacySettings(consent_ack=True)


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
