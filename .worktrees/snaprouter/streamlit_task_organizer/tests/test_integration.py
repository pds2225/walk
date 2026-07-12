from datetime import date

from streamlit_task_organizer.parser.orchestrator import parse_task_text


def test_parse_task_text_for_youth_rent_notice() -> None:
    raw_text = """
    [청년월세 신청서류 보완요청]
    안녕하세요 합정동주민센터입니다.
    청년월세 신청 관련 보완서류 제출 요청드립니다.
    4월 17일(금)까지 아래 서류를 naru0219@mapo.go.kr 로 보내주시기 바랍니다.

    보완서류
    - 부 기준, 모 기준의 가족관계증명서(상세, 주민등록번호 뒷자리 공개)
    - 통장사본
    - 부모님 거주지 임대차계약서(부모님 거주지가 자가 아닐 경우)
    """

    result = parse_task_text(raw_text, date(2026, 4, 15))

    assert result.title == "청년월세 신청서류 메일발송"
    assert result.due_date == "2026-04-17"
    assert result.contacts.emails == ["naru0219@mapo.go.kr"]
    assert len(result.checklist) >= 3
    assert result.organization == "합정동주민센터"
    assert result.category == "보완요청"
