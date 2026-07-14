"""Date helper functions used by the parser."""

from __future__ import annotations

from datetime import date, timedelta

KOREAN_WEEKDAY_INDEX = {
    "월": 0,
    "화": 1,
    "수": 2,
    "목": 3,
    "금": 4,
    "토": 5,
    "일": 6,
}


def normalize_partial_date(month: int, day: int, base_date: date) -> date:
    """Infer the year for a month/day pair near the base date."""

    candidate = date(base_date.year, month, day)
    if (base_date - candidate).days > 180:
        return date(base_date.year + 1, month, day)
    return candidate


def resolve_weekday(base_date: date, weekday_index: int, week_offset: int = 0) -> tuple[date, bool]:
    """Resolve a weekday relative to the base week, rolling to next week if needed."""

    start_of_week = base_date - timedelta(days=base_date.weekday())
    candidate = start_of_week + timedelta(days=weekday_index, weeks=week_offset)
    rolled_forward = False
    if candidate < base_date:
        candidate += timedelta(days=7)
        rolled_forward = True
    return candidate, rolled_forward


def add_days(base_date: date, days: int) -> date:
    """Add days to the base date."""

    return base_date + timedelta(days=days)
