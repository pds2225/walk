"""Extract due dates from cleaned text."""

from __future__ import annotations

from datetime import date

from streamlit_task_organizer.utils.date_utils import (
    KOREAN_WEEKDAY_INDEX,
    add_days,
    normalize_partial_date,
    resolve_weekday,
)
from streamlit_task_organizer.utils.regex_patterns import (
    FULL_DATE_PATTERN,
    KOREAN_DATE_PATTERN,
    NEXT_WEEKDAY_PATTERN,
    RELATIVE_DAYS_PATTERN,
    SLASH_DATE_PATTERN,
    THIS_WEEKDAY_PATTERN,
)


def _safe_iso(year: int, month: int, day: int) -> str | None:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def extract_due_date(cleaned_text: str, base_date: date) -> tuple[str | None, float, list[str]]:
    logs: list[str] = []

    full_match = FULL_DATE_PATTERN.search(cleaned_text)
    if full_match:
        iso_value = _safe_iso(
            int(full_match.group("year")),
            int(full_match.group("month")),
            int(full_match.group("day")),
        )
        if iso_value:
            logs.append(f"절대일자를 추출했습니다: {iso_value}")
            return iso_value, 0.95, logs
        logs.append("절대일자 후보가 있었지만 유효하지 않았습니다.")

    korean_match = KOREAN_DATE_PATTERN.search(cleaned_text)
    if korean_match:
        try:
            candidate = normalize_partial_date(
                int(korean_match.group("month")),
                int(korean_match.group("day")),
                base_date,
            )
            logs.append(f"월/일 형식 기한을 추출했습니다: {candidate.isoformat()}")
            return candidate.isoformat(), 0.88, logs
        except ValueError:
            logs.append("월/일 형식 날짜가 유효하지 않았습니다.")

    slash_match = SLASH_DATE_PATTERN.search(cleaned_text)
    if slash_match:
        try:
            candidate = normalize_partial_date(
                int(slash_match.group("month")),
                int(slash_match.group("day")),
                base_date,
            )
            logs.append(f"슬래시 날짜를 추출했습니다: {candidate.isoformat()}")
            return candidate.isoformat(), 0.86, logs
        except ValueError:
            logs.append("슬래시 날짜가 유효하지 않았습니다.")

    relative_match = RELATIVE_DAYS_PATTERN.search(cleaned_text)
    if relative_match:
        candidate = add_days(base_date, int(relative_match.group("days")))
        logs.append(f"상대기한을 기준일에서 계산했습니다: {candidate.isoformat()}")
        return candidate.isoformat(), 0.78, logs

    this_week_match = THIS_WEEKDAY_PATTERN.search(cleaned_text)
    if this_week_match:
        weekday_index = KOREAN_WEEKDAY_INDEX[this_week_match.group("weekday")]
        candidate, rolled_forward = resolve_weekday(base_date, weekday_index)
        if rolled_forward:
            logs.append("이번 주 요일이 기준일보다 지나 다음 주로 보정했습니다.")
        logs.append(f"이번 주 요일 기한을 계산했습니다: {candidate.isoformat()}")
        return candidate.isoformat(), 0.72, logs

    next_week_match = NEXT_WEEKDAY_PATTERN.search(cleaned_text)
    if next_week_match:
        weekday_index = KOREAN_WEEKDAY_INDEX[next_week_match.group("weekday")]
        candidate, _ = resolve_weekday(base_date, weekday_index, week_offset=1)
        logs.append(f"다음 주 요일 기한을 계산했습니다: {candidate.isoformat()}")
        return candidate.isoformat(), 0.74, logs

    if "내일" in cleaned_text:
        candidate = add_days(base_date, 1)
        logs.append(f"'내일'을 기한으로 해석했습니다: {candidate.isoformat()}")
        return candidate.isoformat(), 0.7, logs

    if "모레" in cleaned_text:
        candidate = add_days(base_date, 2)
        logs.append(f"'모레'를 기한으로 해석했습니다: {candidate.isoformat()}")
        return candidate.isoformat(), 0.7, logs

    logs.append("기한을 추출하지 못했습니다.")
    return None, 0.0, logs
