"""Shared constants for UI and parser rules."""

from __future__ import annotations

CATEGORIES = [
    "보완요청",
    "제출요청",
    "납부요청",
    "방문/예약",
    "일반안내",
]

SUBMIT_METHOD_OPTIONS = [
    "미추출",
    "메일",
    "방문",
    "업로드",
    "문자회신",
    "전화",
    "납부",
    "예약",
    "기타",
]

SAMPLE_LABELS = {
    "직접 입력": None,
    "청년월세 보완요청": "sample_youth_rent.txt",
    "전기요금 납부요청": "sample_payment.txt",
    "건강검진 방문안내": "sample_visit.txt",
}

CHECKLIST_HEADERS = [
    "보완서류",
    "제출서류",
    "준비물",
    "필수서류",
    "첨부서류",
    "준비 항목",
]

RESULT_VERSION = 1
MAX_HISTORY_ITEMS = 5
