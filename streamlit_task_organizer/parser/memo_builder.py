"""Assemble a structured memo line from extracted fields."""

from __future__ import annotations

from streamlit_task_organizer.schemas.result_schema import ContactInfo


def build_memo(
    organization: str | None,
    contacts: ContactInfo,
    submit_method: str,
    conditions: list[str],
) -> tuple[str, list[str]]:
    logs: list[str] = []
    parts: list[str] = []

    if organization:
        parts.append(organization)
    if contacts.emails:
        parts.append(", ".join(contacts.emails))
    if contacts.phones:
        parts.append(", ".join(contacts.phones))
    if submit_method != "미추출":
        parts.append(f"{submit_method} 진행")
    if conditions:
        parts.append(" / ".join(conditions))

    memo = " / ".join(part for part in parts if part)
    logs.append("기관, 연락처, 조건사항을 메모 형식으로 조립했습니다.")
    return memo, logs
