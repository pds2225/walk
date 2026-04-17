"""Session-level history helpers."""

from __future__ import annotations

from datetime import datetime

from streamlit_task_organizer.schemas.result_schema import ParsedTaskResult
from streamlit_task_organizer.utils.constants import MAX_HISTORY_ITEMS


def add_history_entry(history: list[dict], result: ParsedTaskResult) -> list[dict]:
    entry = {
        "id": datetime.now().strftime("%Y%m%d%H%M%S%f"),
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "title": result.title or "제목 없음",
        "due_date": result.due_date,
        "data": result.to_dict(),
    }

    next_history = [entry]
    for item in history:
        if item.get("data", {}).get("raw_text") == result.raw_text:
            continue
        next_history.append(item)
    return next_history[:MAX_HISTORY_ITEMS]


def remove_history_entry(history: list[dict], entry_id: str) -> list[dict]:
    return [item for item in history if item.get("id") != entry_id]


def load_history_entry(history: list[dict], entry_id: str) -> ParsedTaskResult | None:
    for item in history:
        if item.get("id") == entry_id:
            return ParsedTaskResult.from_dict(item["data"])
    return None
