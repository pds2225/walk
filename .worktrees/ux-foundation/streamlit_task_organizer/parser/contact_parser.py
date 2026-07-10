"""Extract emails, phone numbers, and infer the submit method."""

from __future__ import annotations

from streamlit_task_organizer.schemas.result_schema import ContactInfo
from streamlit_task_organizer.utils.formatter import dedupe_preserve_order
from streamlit_task_organizer.utils.regex_patterns import EMAIL_PATTERN, PHONE_PATTERN

SUBMIT_METHOD_KEYWORDS = [
    ("메일", ["이메일", "메일", "발송", "회신"]),
    ("업로드", ["업로드", "첨부", "포털"]),
    ("방문", ["방문", "내원"]),
    ("납부", ["납부", "입금", "계좌이체"]),
    ("예약", ["예약"]),
    ("문자회신", ["문자", "답장"]),
    ("전화", ["전화", "연락"]),
]


def extract_contacts(cleaned_text: str) -> tuple[ContactInfo, str, float, list[str]]:
    logs: list[str] = []
    emails = dedupe_preserve_order(EMAIL_PATTERN.findall(cleaned_text))
    phones = dedupe_preserve_order(PHONE_PATTERN.findall(cleaned_text))

    if emails:
        logs.append(f"이메일 {len(emails)}건을 추출했습니다.")
    if phones:
        logs.append(f"전화번호 {len(phones)}건을 추출했습니다.")

    submit_method = "미추출"
    for method, keywords in SUBMIT_METHOD_KEYWORDS:
        if any(keyword in cleaned_text for keyword in keywords):
            submit_method = method
            logs.append(f"제출방법을 '{method}'로 추정했습니다.")
            break

    if submit_method == "미추출" and emails:
        submit_method = "메일"
        logs.append("이메일 주소가 있어 제출방법을 메일로 보정했습니다.")

    confidence = 0.2
    if emails or phones:
        confidence += 0.35
    if submit_method != "미추출":
        confidence += 0.25

    return ContactInfo(emails=emails, phones=phones), submit_method, min(confidence, 1.0), logs
