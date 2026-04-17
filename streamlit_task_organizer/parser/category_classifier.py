"""Rule-based document category classifier."""

from __future__ import annotations

from streamlit_task_organizer.utils.constants import CATEGORIES

CATEGORY_KEYWORDS: dict[str, dict[str, float]] = {
    "보완요청": {
        "보완서류": 0.5,
        "보완요청": 0.5,
        "재제출": 0.4,
        "수정": 0.2,
        "추가서류": 0.3,
    },
    "제출요청": {
        "제출": 0.35,
        "보내주시기": 0.35,
        "회신": 0.25,
        "첨부": 0.2,
        "서류": 0.15,
    },
    "납부요청": {
        "납부": 0.5,
        "입금": 0.4,
        "요금": 0.2,
        "금액": 0.2,
        "계좌이체": 0.25,
    },
    "방문/예약": {
        "방문": 0.35,
        "예약": 0.4,
        "내원": 0.35,
        "검진": 0.2,
        "일정": 0.1,
    },
    "일반안내": {
        "안내": 0.15,
        "공지": 0.15,
        "확인": 0.15,
    },
}


def classify_category(cleaned_text: str) -> tuple[str, float, list[str]]:
    scores = {category: 0.0 for category in CATEGORIES}
    logs: list[str] = []

    for category, keyword_map in CATEGORY_KEYWORDS.items():
        for keyword, weight in keyword_map.items():
            if keyword in cleaned_text:
                scores[category] += weight
                logs.append(f"카테고리 규칙 적중: {category} <- {keyword}")

    best_category = max(scores, key=scores.get)
    best_score = scores[best_category]
    if best_score == 0:
        logs.append("특정 카테고리 키워드가 부족해 일반안내로 분류했습니다.")
        return "일반안내", 0.35, logs

    return best_category, min(1.0, 0.45 + best_score), logs
