"""Extract checklist items and conditions from cleaned text."""

from __future__ import annotations

import re

from streamlit_task_organizer.utils.constants import CHECKLIST_HEADERS
from streamlit_task_organizer.utils.formatter import dedupe_preserve_order
from streamlit_task_organizer.utils.regex_patterns import BULLET_PATTERN, CONDITION_PATTERN


def _looks_like_header(line: str) -> bool:
    return any(header in line for header in CHECKLIST_HEADERS)


def _looks_like_other_metadata(line: str) -> bool:
    metadata_keywords = ["문의", "연락", "기한", "까지", "담당", "@", "http", "방법", "제출처"]
    return any(keyword in line for keyword in metadata_keywords)


def _expand_family_certificate_item(item: str) -> list[str]:
    pattern = re.compile(r"부 기준\s*[,/및와]\s*모 기준(?:의)?\s*(.+)")
    match = pattern.search(item)
    if not match:
        return [item]

    suffix = match.group(1).strip()
    return [f"부 기준 {suffix}", f"모 기준 {suffix}"]


def extract_checklist(cleaned_text: str) -> tuple[list[str], list[str], float, list[str]]:
    logs: list[str] = []
    conditions: list[str] = []
    checklist_items: list[str] = []
    capture_mode = False

    for raw_line in cleaned_text.splitlines():
        line = raw_line.strip()
        if not line:
            if capture_mode:
                capture_mode = False
            continue

        if _looks_like_header(line):
            capture_mode = True
            logs.append(f"체크리스트 헤더 감지: {line}")
            continue

        bullet_match = BULLET_PATTERN.match(line)
        if bullet_match:
            capture_mode = True
            item = bullet_match.group(1).strip(" -•*")
        elif capture_mode and not _looks_like_other_metadata(line):
            item = line
        else:
            continue

        for expanded_item in _expand_family_certificate_item(item):
            checklist_items.append(expanded_item)
            for condition in CONDITION_PATTERN.findall(expanded_item):
                conditions.append(condition.strip(" ()"))

    checklist_items = dedupe_preserve_order(checklist_items)
    conditions = dedupe_preserve_order(conditions)
    if checklist_items:
        logs.append(f"체크리스트 {len(checklist_items)}건을 추출했습니다.")
    else:
        logs.append("체크리스트를 찾지 못했습니다.")

    confidence = 0.85 if checklist_items else 0.25
    return checklist_items, conditions, confidence, logs
