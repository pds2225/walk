from streamlit_task_organizer.parser.checklist_parser import extract_checklist


def test_extract_checklist_and_conditions() -> None:
    checklist, conditions, confidence, _ = extract_checklist(
        """
        보완서류
        - 부 기준, 모 기준의 가족관계증명서(상세, 주민등록번호 뒷자리 공개)
        - 통장사본
        - 부모님 거주지 임대차계약서(부모님 거주지가 자가 아닐 경우)
        """
    )

    assert "부 기준 가족관계증명서(상세, 주민등록번호 뒷자리 공개)" in checklist
    assert "모 기준 가족관계증명서(상세, 주민등록번호 뒷자리 공개)" in checklist
    assert "통장사본" in checklist
    assert any("자가 아닐 경우" in condition for condition in conditions)
    assert confidence >= 0.8
