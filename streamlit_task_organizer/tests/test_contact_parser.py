from streamlit_task_organizer.parser.contact_parser import extract_contacts


def test_extract_contacts_and_submit_method() -> None:
    contacts, submit_method, confidence, _ = extract_contacts(
        "문의는 naru0219@mapo.go.kr 또는 02-123-4567로 부탁드립니다. 메일로 보내주세요."
    )

    assert contacts.emails == ["naru0219@mapo.go.kr"]
    assert contacts.phones == ["02-123-4567"]
    assert submit_method == "메일"
    assert confidence >= 0.7
