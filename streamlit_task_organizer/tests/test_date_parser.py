from datetime import date

from streamlit_task_organizer.parser.date_parser import extract_due_date


def test_extract_due_date_from_korean_month_day() -> None:
    due_date, confidence, _ = extract_due_date("4월 17일(금)까지 제출", date(2026, 4, 15))
    assert due_date == "2026-04-17"
    assert confidence >= 0.85


def test_extract_due_date_from_relative_days() -> None:
    due_date, confidence, _ = extract_due_date("문자 수신 후 14일 이내 제출", date(2026, 4, 15))
    assert due_date == "2026-04-29"
    assert confidence >= 0.75


def test_extract_due_date_from_this_weekday() -> None:
    due_date, confidence, _ = extract_due_date("이번 주 금요일까지 예약 완료", date(2026, 4, 15))
    assert due_date == "2026-04-17"
    assert confidence >= 0.7
