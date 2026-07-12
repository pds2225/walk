"""Build action-oriented task titles."""

from __future__ import annotations

import re

from streamlit_task_organizer.utils.regex_patterns import BRACKET_TITLE_PATTERN

ACTION_SUFFIX_BY_METHOD = {
    "메일": "메일발송",
    "업로드": "업로드제출",
    "방문": "방문진행",
    "납부": "납부",
    "예약": "예약완료",
    "문자회신": "문자회신",
    "전화": "전화확인",
}

ACTION_SUFFIX_BY_CATEGORY = {
    "보완요청": "보완서류제출",
    "제출요청": "서류제출",
    "납부요청": "납부",
    "방문/예약": "방문진행",
    "일반안내": "후속조치",
}


def _normalize_subject(subject: str) -> str:
    subject = re.sub(r"(보완요청|제출요청|납부요청|방문안내|안내|요청|공지|알림)", "", subject)
    subject = re.sub(r"[\[\]()]+", " ", subject)
    subject = re.sub(r"\s{2,}", " ", subject)
    return subject.strip(" -:/")


def build_title(
    cleaned_text: str,
    category: str,
    task_summary: str,
    submit_method: str,
    organization: str | None,
) -> tuple[str, float, list[str]]:
    logs: list[str] = []

    subject = ""
    title_candidates = BRACKET_TITLE_PATTERN.findall(cleaned_text)
    if title_candidates:
        subject = _normalize_subject(title_candidates[0])
        logs.append(f"대괄호 제목 후보를 사용했습니다: {subject}")

    if not subject:
        first_line = cleaned_text.splitlines()[0] if cleaned_text.splitlines() else ""
        subject = _normalize_subject(first_line)
        if subject:
            logs.append(f"첫 줄을 제목 후보로 사용했습니다: {subject}")

    if not subject and organization:
        subject = organization
        logs.append("기관명을 제목 주어로 사용했습니다.")

    if not subject:
        subject = "할일"
        logs.append("기본 제목 주어를 사용했습니다.")

    action_suffix = ACTION_SUFFIX_BY_METHOD.get(
        submit_method, ACTION_SUFFIX_BY_CATEGORY.get(category, "후속조치")
    )
    if submit_method == "메일" and "발송" not in task_summary and "제출" in task_summary:
        action_suffix = "메일발송"

    title = f"{subject} {action_suffix}".strip()
    title = re.sub(r"\s{2,}", " ", title)
    return title, 0.82 if subject else 0.45, logs
