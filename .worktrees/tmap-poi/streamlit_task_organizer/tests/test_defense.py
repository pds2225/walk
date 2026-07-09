"""
Defense tests for the parsing pipeline.
Verifies that all parsers handle abnormal inputs (empty string, no date, no contacts)
without crashing and return safe default values.
"""

from datetime import date

from streamlit_task_organizer.parser.checklist_parser import extract_checklist
from streamlit_task_organizer.parser.contact_parser import extract_contacts
from streamlit_task_organizer.parser.date_parser import extract_due_date
from streamlit_task_organizer.parser.orchestrator import parse_task_text

BASE_DATE = date(2026, 4, 23)


class TestEmptyInput:
    def test_date_parser_empty_string_returns_none(self):
        due_date, confidence, logs = extract_due_date("", BASE_DATE)
        assert due_date is None
        assert confidence == 0.0

    def test_contact_parser_empty_string_returns_empty_lists(self):
        contacts, submit_method, confidence, logs = extract_contacts("")
        assert contacts.emails == []
        assert contacts.phones == []

    def test_checklist_parser_empty_string_returns_empty_list(self):
        items, conditions, confidence, logs = extract_checklist("")
        assert items == []
        assert conditions == []

    def test_orchestrator_empty_string_does_not_crash(self):
        result = parse_task_text("", BASE_DATE)
        assert result is not None
        assert result.due_date is None
        assert result.contacts.emails == []
        assert result.checklist == []


class TestNoDueDate:
    def test_text_without_date_returns_none(self):
        text = "서류를 제출해 주시기 바랍니다. 이메일로 보내주세요."
        due_date, confidence, logs = extract_due_date(text, BASE_DATE)
        assert due_date is None
        assert confidence == 0.0

    def test_only_metadata_no_date(self):
        text = "담당자: 홍길동 / 연락처: 010-1234-5678"
        due_date, confidence, _ = extract_due_date(text, BASE_DATE)
        assert due_date is None

    def test_orchestrator_no_date_field_is_none(self):
        text = "이 공문은 날짜 정보를 포함하지 않습니다."
        result = parse_task_text(text, BASE_DATE)
        assert result.due_date is None
        assert result.confidence.due_date == 0.0


class TestNoContacts:
    def test_text_without_contact_returns_empty(self):
        text = "5월 15일까지 서류를 제출해 주시기 바랍니다."
        contacts, submit_method, confidence, logs = extract_contacts(text)
        assert contacts.emails == []
        assert contacts.phones == []

    def test_confidence_is_low_without_contacts(self):
        contacts, submit_method, confidence, logs = extract_contacts("제출 안내입니다.")
        assert confidence < 0.5

    def test_orchestrator_no_contacts_field_is_empty(self):
        text = "안내문입니다. 4월 30일까지 완료해 주세요."
        result = parse_task_text(text, BASE_DATE)
        assert result.contacts.emails == []
        assert result.contacts.phones == []


class TestMalformedInput:
    def test_whitespace_only_input(self):
        due_date, _, _ = extract_due_date("   \n\t  ", BASE_DATE)
        assert due_date is None

    def test_special_characters_only(self):
        contacts, _, _, _ = extract_contacts("!@#$%^&*()")
        assert contacts.emails == []
        assert contacts.phones == []

    def test_very_long_input_without_patterns(self):
        text = "가나다라마바사" * 200
        due_date, _, _ = extract_due_date(text, BASE_DATE)
        assert due_date is None
        contacts, _, _, _ = extract_contacts(text)
        assert contacts.emails == []
