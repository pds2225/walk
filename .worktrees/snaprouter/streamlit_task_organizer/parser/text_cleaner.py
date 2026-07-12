"""Normalize raw text before downstream parsing."""

from __future__ import annotations

import re

from streamlit_task_organizer.utils.regex_patterns import (
    BLANK_LINES_PATTERN,
    MARKDOWN_EMPHASIS_PATTERN,
    MULTI_SPACE_PATTERN,
)


def clean_text(raw_text: str) -> tuple[str, list[str]]:
    logs: list[str] = []
    cleaned = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    if cleaned != raw_text:
        logs.append("줄바꿈 형식을 통일했습니다.")

    cleaned = re.sub(r"^\[(?:Web발신|국외발신|광고)\]\s*", "", cleaned)
    if cleaned != raw_text:
        logs.append("발신 메타정보를 제거했습니다.")

    cleaned = MARKDOWN_EMPHASIS_PATTERN.sub("", cleaned)
    cleaned = "\n".join(line.strip() for line in cleaned.splitlines())
    cleaned = MULTI_SPACE_PATTERN.sub(" ", cleaned)
    cleaned = BLANK_LINES_PATTERN.sub("\n\n", cleaned)
    cleaned = cleaned.strip()
    logs.append("공백과 마크다운 기호를 정리했습니다.")
    return cleaned, logs
