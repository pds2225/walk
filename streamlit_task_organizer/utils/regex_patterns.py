"""Regular expressions shared across parser modules."""

from __future__ import annotations

import re

EMAIL_PATTERN = re.compile(r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b")
PHONE_PATTERN = re.compile(
    r"(?<!\d)(?:0\d{1,2}-\d{3,4}-\d{4}|0\d{8,10}|1\d{3}-\d{4})(?!\d)"
)
BRACKET_TITLE_PATTERN = re.compile(r"\[([^\]]+)\]")
BULLET_PATTERN = re.compile(r"^(?:[-•*]\s*|[0-9]+\.\s*)(.+)$")
MARKDOWN_EMPHASIS_PATTERN = re.compile(r"(\*\*|__|`|#+\s*)")
MULTI_SPACE_PATTERN = re.compile(r"[ \t]{2,}")
BLANK_LINES_PATTERN = re.compile(r"\n{3,}")
CONDITION_PATTERN = re.compile(r"([^.\n]*(?:경우|시|이라면|조건)[^.\n]*)")
ORG_CANDIDATE_PATTERN = re.compile(
    r"([가-힣A-Za-z0-9\s]{2,}(?:주민센터|구청|시청|군청|보건소|관리사무소|학교|병원|센터))"
)
KOREAN_DATE_PATTERN = re.compile(
    r"(?P<month>\d{1,2})\s*월\s*(?P<day>\d{1,2})\s*일(?:\([월화수목금토일]\))?"
)
FULL_DATE_PATTERN = re.compile(
    r"(?P<year>20\d{2})[./-]\s*(?P<month>\d{1,2})[./-]\s*(?P<day>\d{1,2})"
)
SLASH_DATE_PATTERN = re.compile(r"(?P<month>\d{1,2})\s*/\s*(?P<day>\d{1,2})")
RELATIVE_DAYS_PATTERN = re.compile(
    r"(?:(?:문자|메일)?\s*수신\s*후|안내\s*후|통보\s*후|접수\s*후)?\s*(?P<days>\d{1,3})\s*일(?:\s*이내)?"
)
THIS_WEEKDAY_PATTERN = re.compile(r"이번\s*주\s*(?P<weekday>[월화수목금토일])(?:요일)?")
NEXT_WEEKDAY_PATTERN = re.compile(r"다음\s*주\s*(?P<weekday>[월화수목금토일])(?:요일)?")
