"""Formatting helpers for result rendering and export."""

from __future__ import annotations

from typing import Iterable


def dedupe_preserve_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for item in items:
        normalized = " ".join(item.split())
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped


def to_multiline_text(items: Iterable[str]) -> str:
    return "\n".join(item for item in items if item)


def split_multiline_text(value: str) -> list[str]:
    return [line.strip() for line in value.splitlines() if line.strip()]


def format_due_date_label(due_date: str | None) -> str:
    return due_date if due_date else "미추출"
