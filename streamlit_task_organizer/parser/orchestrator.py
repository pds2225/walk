"""Coordinate the end-to-end parsing pipeline."""

from __future__ import annotations

import re
from datetime import date

from streamlit_task_organizer.parser.category_classifier import classify_category
from streamlit_task_organizer.parser.checklist_parser import extract_checklist
from streamlit_task_organizer.parser.contact_parser import extract_contacts
from streamlit_task_organizer.parser.date_parser import extract_due_date
from streamlit_task_organizer.parser.memo_builder import build_memo
from streamlit_task_organizer.parser.text_cleaner import clean_text
from streamlit_task_organizer.parser.title_builder import build_title
from streamlit_task_organizer.schemas.result_schema import ConfidenceScores, ParsedTaskResult
from streamlit_task_organizer.utils.regex_patterns import BRACKET_TITLE_PATTERN, ORG_CANDIDATE_PATTERN


def _normalize_organization(raw_value: str) -> str:
    organization = raw_value.strip()
    organization = re.sub(r"^(안녕하세요|안녕하십니까)\s*", "", organization)
    organization = re.sub(r"\s*입니다\.?$", "", organization)
    return organization.strip()


def _extract_organization(cleaned_text: str) -> tuple[str | None, float, list[str]]:
    logs: list[str] = []
    bracket_candidates = BRACKET_TITLE_PATTERN.findall(cleaned_text)
    for candidate in bracket_candidates:
        org_match = ORG_CANDIDATE_PATTERN.search(candidate)
        if org_match:
            organization = _normalize_organization(org_match.group(1))
            logs.append(f"대괄호에서 기관명을 추출했습니다: {organization}")
            return organization, 0.86, logs

    line_candidates = cleaned_text.splitlines()[:4]
    for line in line_candidates:
        org_match = ORG_CANDIDATE_PATTERN.search(line)
        if org_match:
            organization = _normalize_organization(org_match.group(1))
            logs.append(f"본문 상단에서 기관명을 추출했습니다: {organization}")
            return organization, 0.8, logs

        intro_match = re.search(r"안녕(?:하세요|하십니까)\s*([가-힣A-Za-z0-9\s]{2,})입니다", line)
        if intro_match:
            organization = _normalize_organization(intro_match.group(1))
            logs.append(f"인사 문구에서 기관명을 추출했습니다: {organization}")
            return organization, 0.72, logs

    logs.append("기관명을 찾지 못했습니다.")
    return None, 0.0, logs


def _build_task_summary(category: str, submit_method: str) -> tuple[str, list[str]]:
    logs: list[str] = []

    if category == "보완요청":
        summary = "보완서류를 준비하여 이메일로 제출" if submit_method == "메일" else "보완서류를 준비해 제출"
    elif category == "제출요청":
        if submit_method == "메일":
            summary = "필요한 항목을 준비하여 이메일로 제출"
        elif submit_method == "업로드":
            summary = "필요한 항목을 정리해 업로드로 제출"
        else:
            summary = "필요한 항목을 준비해 제출"
    elif category == "납부요청":
        summary = "기한 내 해당 금액을 납부"
    elif category == "방문/예약":
        if submit_method == "예약":
            summary = "안내된 방법으로 예약을 완료"
        else:
            summary = "지정 일정에 방문하여 절차 진행"
    else:
        summary = "안내 내용을 확인하고 필요한 조치 진행"

    logs.append(f"카테고리와 제출방법을 바탕으로 할일 요약을 생성했습니다: {summary}")
    return summary, logs


def parse_task_text(raw_text: str, base_date: date) -> ParsedTaskResult:
    parse_logs: list[str] = []
    cleaned_text, cleaner_logs = clean_text(raw_text)
    parse_logs.extend(cleaner_logs)

    category, category_confidence, category_logs = classify_category(cleaned_text)
    parse_logs.extend(category_logs)

    due_date, due_confidence, due_logs = extract_due_date(cleaned_text, base_date)
    parse_logs.extend(due_logs)

    contacts, submit_method, contact_confidence, contact_logs = extract_contacts(cleaned_text)
    parse_logs.extend(contact_logs)

    checklist, conditions, checklist_confidence, checklist_logs = extract_checklist(cleaned_text)
    parse_logs.extend(checklist_logs)

    organization, organization_confidence, organization_logs = _extract_organization(cleaned_text)
    parse_logs.extend(organization_logs)

    task_summary, task_logs = _build_task_summary(category, submit_method)
    parse_logs.extend(task_logs)

    title, title_confidence, title_logs = build_title(
        cleaned_text=cleaned_text,
        category=category,
        task_summary=task_summary,
        submit_method=submit_method,
        organization=organization,
    )
    parse_logs.extend(title_logs)

    memo, memo_logs = build_memo(
        organization=organization,
        contacts=contacts,
        submit_method=submit_method,
        conditions=conditions,
    )
    parse_logs.extend(memo_logs)

    confidence = ConfidenceScores(
        title=title_confidence,
        due_date=due_confidence,
        checklist=checklist_confidence,
        contacts=contact_confidence,
        organization=organization_confidence,
        category=category_confidence,
    )

    return ParsedTaskResult(
        title=title,
        due_date=due_date,
        task_summary=task_summary,
        category=category,
        organization=organization,
        memo=memo,
        contacts=contacts,
        checklist=checklist,
        conditions=conditions,
        submit_method=submit_method,
        raw_text=raw_text,
        confidence=confidence,
        parse_logs=parse_logs,
    )
