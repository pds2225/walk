from streamlit_task_organizer.parser.title_builder import build_title


def test_build_title_uses_bracket_subject_and_mail_suffix() -> None:
    title, confidence, _ = build_title(
        cleaned_text="[청년월세 신청서류 보완요청]\n4월 17일까지 메일로 보내주세요.",
        category="보완요청",
        task_summary="보완서류를 준비하여 이메일로 제출",
        submit_method="메일",
        organization="합정동주민센터",
    )

    assert title == "청년월세 신청서류 메일발송"
    assert confidence >= 0.8
