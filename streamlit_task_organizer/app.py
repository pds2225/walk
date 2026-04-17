"""Single-screen Streamlit app for text-to-task organization."""

from __future__ import annotations

from datetime import date

import streamlit as st

from streamlit_task_organizer.parser import parse_task_text
from streamlit_task_organizer.schemas.result_schema import ParsedTaskResult
from streamlit_task_organizer.services.export_service import build_export_payload
from streamlit_task_organizer.services.history_service import (
    add_history_entry,
    load_history_entry,
    remove_history_entry,
)
from streamlit_task_organizer.services.sample_service import (
    get_sample_labels,
    load_sample_text,
)
from streamlit_task_organizer.utils.constants import (
    CATEGORIES,
    RESULT_VERSION,
    SUBMIT_METHOD_OPTIONS,
)
from streamlit_task_organizer.utils.formatter import (
    format_due_date_label,
    split_multiline_text,
    to_multiline_text,
)


st.set_page_config(
    page_title="텍스트 기반 할일 정리 서비스",
    page_icon="📝",
    layout="wide",
)


def apply_custom_styles() -> None:
    st.markdown(
        """
        <style>
        :root {
            --ink: #21302a;
            --muted: #6b746d;
            --surface: rgba(255, 255, 255, 0.76);
            --line: rgba(33, 48, 42, 0.14);
            --accent: #ca6634;
            --accent-soft: rgba(202, 102, 52, 0.12);
            --warn: #a44e1b;
        }
        .stApp {
            background:
                radial-gradient(circle at top left, rgba(202, 102, 52, 0.12), transparent 28%),
                linear-gradient(180deg, #f3efe7 0%, #f8f5ef 30%, #fcfbf8 100%);
            color: var(--ink);
        }
        .block-container {
            max-width: 1180px;
            padding-top: 2.25rem;
            padding-bottom: 3rem;
        }
        .hero-kicker {
            color: var(--accent);
            letter-spacing: 0.08em;
            font-size: 0.78rem;
            font-weight: 700;
            text-transform: uppercase;
        }
        .hero-copy {
            max-width: 720px;
            color: var(--muted);
            line-height: 1.6;
            margin-bottom: 0.5rem;
        }
        .section-label {
            font-size: 0.92rem;
            color: var(--accent);
            letter-spacing: 0.06em;
            text-transform: uppercase;
            font-weight: 700;
            margin-bottom: 0.2rem;
        }
        .status-strip {
            display: inline-block;
            padding: 0.28rem 0.72rem;
            border-radius: 999px;
            background: var(--surface);
            border: 1px solid var(--line);
            margin-right: 0.5rem;
            margin-bottom: 0.5rem;
        }
        .status-warn {
            color: var(--warn);
            background: rgba(164, 78, 27, 0.1);
            border-color: rgba(164, 78, 27, 0.18);
        }
        .helper-text {
            color: var(--muted);
            font-size: 0.92rem;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def init_session_state() -> None:
    defaults = {
        "raw_text_input": "",
        "base_date_input": date.today(),
        "sample_selector": "직접 입력",
        "parsed_result": None,
        "history": [],
        "debug_toggle": False,
        "last_error": None,
        "parsed_result_version": RESULT_VERSION,
        "sample_loaded": False,
        "export_text_cache": "",
        "result_title": "",
        "result_due_date": "",
        "result_task_summary": "",
        "result_category": "일반안내",
        "result_org": "",
        "result_memo": "",
        "result_checklist": [],
        "result_emails": "",
        "result_phones": "",
        "result_submit_method": "미추출",
        "result_conditions": "",
        "new_checklist_item": "",
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


def reset_session_state() -> None:
    defaults = {
        "raw_text_input": "",
        "base_date_input": date.today(),
        "sample_selector": "직접 입력",
        "parsed_result": None,
        "history": [],
        "debug_toggle": False,
        "last_error": None,
        "parsed_result_version": RESULT_VERSION,
        "sample_loaded": False,
        "export_text_cache": "",
        "result_title": "",
        "result_due_date": "",
        "result_task_summary": "",
        "result_category": "일반안내",
        "result_org": "",
        "result_memo": "",
        "result_checklist": [],
        "result_emails": "",
        "result_phones": "",
        "result_submit_method": "미추출",
        "result_conditions": "",
        "new_checklist_item": "",
    }
    for key, value in defaults.items():
        st.session_state[key] = value


def section_header(label: str, title: str, description: str | None = None) -> None:
    st.markdown(f'<div class="section-label">{label}</div>', unsafe_allow_html=True)
    st.subheader(title)
    if description:
        st.markdown(f'<div class="helper-text">{description}</div>', unsafe_allow_html=True)


def load_sample_into_editor(sample_label: str) -> None:
    sample_text = load_sample_text(sample_label)
    if not sample_text:
        return
    st.session_state.raw_text_input = sample_text
    st.session_state.sample_selector = sample_label
    st.session_state.sample_loaded = True


def load_result_into_editor(result: ParsedTaskResult) -> None:
    st.session_state.parsed_result = result
    st.session_state.result_title = result.title
    st.session_state.result_due_date = result.due_date or ""
    st.session_state.result_task_summary = result.task_summary
    st.session_state.result_category = result.category
    st.session_state.result_org = result.organization or ""
    st.session_state.result_memo = result.memo
    st.session_state.result_emails = to_multiline_text(result.contacts.emails)
    st.session_state.result_phones = to_multiline_text(result.contacts.phones)
    st.session_state.result_submit_method = result.submit_method
    st.session_state.result_conditions = to_multiline_text(result.conditions)
    st.session_state.result_checklist = [
        {"done": False, "text": item} for item in result.checklist
    ]
    st.session_state.export_text_cache = build_export_payload(result).clipboard_text


def sync_result_from_editor() -> ParsedTaskResult | None:
    result: ParsedTaskResult | None = st.session_state.parsed_result
    if result is None:
        return None

    result.title = st.session_state.result_title.strip()
    result.due_date = st.session_state.result_due_date.strip() or None
    result.task_summary = st.session_state.result_task_summary.strip()
    result.category = st.session_state.result_category
    result.organization = st.session_state.result_org.strip() or None
    result.memo = st.session_state.result_memo.strip()
    result.contacts.emails = split_multiline_text(st.session_state.result_emails)
    result.contacts.phones = split_multiline_text(st.session_state.result_phones)
    result.submit_method = st.session_state.result_submit_method
    result.conditions = split_multiline_text(st.session_state.result_conditions)
    result.checklist = [
        item["text"].strip()
        for item in st.session_state.result_checklist
        if item.get("text", "").strip()
    ]
    st.session_state.export_text_cache = build_export_payload(result).clipboard_text
    return result


def handle_parse_action() -> None:
    raw_text = st.session_state.raw_text_input.strip()
    if not raw_text:
        st.session_state.last_error = "분석할 원문이 없습니다. 문자나 공지문을 먼저 붙여넣어 주세요."
        return

    try:
        with st.spinner("문장을 읽고 할일 구조로 정리하는 중입니다..."):
            result = parse_task_text(raw_text, st.session_state.base_date_input)
        load_result_into_editor(result)
        st.session_state.history = add_history_entry(st.session_state.history, result)
        st.session_state.last_error = None
    except Exception:
        st.session_state.last_error = (
            "자동 정리 중 문제가 발생했습니다. 원문은 유지되며, 입력 내용을 계속 수정할 수 있습니다."
        )


def render_header() -> None:
    left_col, right_col = st.columns([4, 1])
    with left_col:
        st.markdown('<div class="hero-kicker">Text To Task Organizer</div>', unsafe_allow_html=True)
        st.title("텍스트 기반 할일 정리 서비스")
        st.markdown(
            '<div class="hero-copy">문자, 공지, 이메일 본문을 붙여넣으면 제목, 기한, 체크리스트, 연락처를 한 화면에서 정리합니다. 페이지를 옮기지 않고 바로 검토하고 고칠 수 있게 설계했습니다.</div>',
            unsafe_allow_html=True,
        )
    with right_col:
        st.write("")
        if st.button("예시 불러오기", key="quick_sample_loader", use_container_width=True):
            load_sample_into_editor("청년월세 보완요청")
            st.rerun()

    with st.expander("사용 가이드", expanded=False):
        st.markdown(
            """
            1. 원문 입력창에 문자, 공지문, 이메일 본문을 붙여넣습니다.
            2. 기준일을 선택합니다. 기준일은 `이번 주 금요일` 같은 표현을 실제 날짜로 바꾸는 기준 날짜입니다.
            3. `할일 정리 실행`을 누르면 제목, 기한, 체크리스트가 자동 생성됩니다.
            4. 결과를 직접 고친 뒤 TXT, JSON, CSV로 내려받을 수 있습니다.
            """
        )


def render_input_section() -> None:
    section_header(
        "Input",
        "원문 입력",
        "좌측에는 원문, 우측에는 기준일과 예시를 배치해 바로 실험할 수 있게 구성했습니다.",
    )
    left_col, right_col = st.columns([7, 3], gap="large")
    with left_col:
        st.text_area(
            "원문 입력",
            key="raw_text_input",
            height=360,
            placeholder="문자·공지문·이메일 본문을 붙여넣으세요.",
            label_visibility="collapsed",
        )
        st.caption(f"입력 길이: {len(st.session_state.raw_text_input)}자")

    with right_col:
        st.date_input(
            "기준일",
            key="base_date_input",
            help="상대 날짜 표현을 실제 날짜로 바꾸는 기준 날짜입니다.",
        )
        st.selectbox(
            "입력 샘플 선택",
            options=get_sample_labels(),
            key="sample_selector",
        )
        if st.button("선택 예시 불러오기", key="selected_sample_loader", use_container_width=True):
            load_sample_into_editor(st.session_state.sample_selector)
            st.rerun()
        st.markdown(
            """
            <div class="helper-text">
            파싱은 규칙 기반으로 동작합니다. 규칙 기반은 사람이 정한 패턴으로 찾는 방식이라, 결과 이유를 로그로 확인할 수 있는 장점이 있습니다.
            </div>
            """,
            unsafe_allow_html=True,
        )


def render_action_section() -> None:
    section_header("Action", "파싱 실행", "입력이 없으면 실행 버튼을 누를 수 없도록 막아 실수를 줄였습니다.")
    action_col1, action_col2, action_col3 = st.columns([2, 1, 1])
    with action_col1:
        if st.button(
            "할일 정리 실행",
            key="parse_button",
            type="primary",
            use_container_width=True,
            disabled=not bool(st.session_state.raw_text_input.strip()),
        ):
            handle_parse_action()
    with action_col2:
        if st.button("초기화", key="reset_button", use_container_width=True):
            reset_session_state()
            st.rerun()
    with action_col3:
        if st.button(
            "결과 다시 생성",
            key="reparse_button",
            use_container_width=True,
            disabled=not bool(st.session_state.raw_text_input.strip()),
        ):
            handle_parse_action()

    if st.session_state.last_error:
        st.warning(st.session_state.last_error)


def render_result_summary() -> None:
    result = st.session_state.parsed_result
    if result is None:
        return

    section_header("Result", "결과 요약", "핵심 항목을 먼저 보여 주고, 바로 아래에서 값을 수정할 수 있게 했습니다.")
    due_date_badge = format_due_date_label(result.due_date)
    badge_class = "status-strip" if result.due_date else "status-strip status-warn"
    st.markdown(
        f'<span class="{badge_class}">기한: {due_date_badge}</span>'
        f'<span class="status-strip">카테고리: {result.category}</span>'
        f'<span class="status-strip">제출방법: {result.submit_method}</span>',
        unsafe_allow_html=True,
    )

    top_col1, top_col2 = st.columns([2, 1], gap="large")
    with top_col1:
        st.text_input("제목", key="result_title")
    with top_col2:
        st.text_input(
            "기한",
            key="result_due_date",
            placeholder="YYYY-MM-DD",
            help="연-월-일 형식으로 직접 수정할 수 있습니다.",
        )

    mid_col1, mid_col2 = st.columns([2, 1], gap="large")
    with mid_col1:
        st.text_area("할일 요약", key="result_task_summary", height=90)
    with mid_col2:
        st.selectbox("카테고리", options=CATEGORIES, key="result_category")

    bottom_col1, bottom_col2 = st.columns([1, 1], gap="large")
    with bottom_col1:
        st.text_input("기관명", key="result_org")
    with bottom_col2:
        st.selectbox("제출방법", options=SUBMIT_METHOD_OPTIONS, key="result_submit_method")

    st.text_area("메모", key="result_memo", height=100)


def render_checklist_editor() -> None:
    if st.session_state.parsed_result is None:
        return

    section_header("Checklist", "체크리스트", "한 줄씩 수정, 추가, 삭제할 수 있도록 세션 상태에 보관합니다.")
    checklist_rows = list(st.session_state.result_checklist)
    delete_index: int | None = None

    if not checklist_rows:
        st.info("자동 추출된 항목이 없습니다. 아래에서 직접 추가할 수 있습니다.")

    for index, row in enumerate(checklist_rows):
        row_col1, row_col2, row_col3 = st.columns([1, 7, 1], gap="small")
        is_done = row_col1.checkbox(
            "완료",
            value=row.get("done", False),
            key=f"check_done_{index}",
            label_visibility="collapsed",
        )
        text_value = row_col2.text_input(
            f"체크리스트 {index + 1}",
            value=row.get("text", ""),
            key=f"check_text_{index}",
            label_visibility="collapsed",
            placeholder="체크리스트 항목",
        )
        if row_col3.button("삭제", key=f"check_delete_{index}", use_container_width=True):
            delete_index = index
        checklist_rows[index] = {"done": is_done, "text": text_value}

    st.session_state.result_checklist = checklist_rows

    add_col1, add_col2 = st.columns([6, 1], gap="small")
    add_col1.text_input(
        "새 항목",
        key="new_checklist_item",
        placeholder="누락된 항목을 직접 추가하세요.",
        label_visibility="collapsed",
    )
    if add_col2.button("추가", key="add_checklist_item", use_container_width=True):
        new_item = st.session_state.new_checklist_item.strip()
        if new_item:
            checklist_rows.append({"done": False, "text": new_item})
            st.session_state.result_checklist = checklist_rows
            st.session_state.new_checklist_item = ""
            st.rerun()

    if delete_index is not None:
        checklist_rows.pop(delete_index)
        st.session_state.result_checklist = checklist_rows
        st.rerun()


def render_contact_section() -> None:
    if st.session_state.parsed_result is None:
        return

    section_header(
        "Contact",
        "연락처와 추가정보",
        "이메일, 전화번호, 조건사항을 메모와 분리해 저장하면 나중에 다른 시스템으로 옮기기 쉽습니다.",
    )
    left_col, right_col = st.columns(2, gap="large")
    with left_col:
        st.text_area(
            "이메일 목록",
            key="result_emails",
            height=110,
            help="줄바꿈으로 여러 건을 입력할 수 있습니다.",
        )
        st.text_area(
            "전화번호 목록",
            key="result_phones",
            height=110,
            help="줄바꿈으로 여러 건을 입력할 수 있습니다.",
        )
    with right_col:
        st.text_area(
            "조건사항",
            key="result_conditions",
            height=110,
            help="예: 자가 아닐 경우 임대차계약서 필요",
        )
        st.caption("조건사항은 예외 조건이나 추가 제출 기준을 따로 적어 두는 칸입니다.")


def render_export_section() -> None:
    result = sync_result_from_editor()
    if result is None:
        return

    payload = build_export_payload(result)
    section_header("Export", "다운로드", "복사용 문안은 바로 읽히는 형태로 제공하고, 시스템 연동용 JSON과 엑셀용 CSV도 함께 제공합니다.")
    st.text_area(
        "복사용 최종 문안",
        value=payload.clipboard_text,
        height=220,
        help="브라우저에서 바로 선택 후 복사할 수 있는 텍스트입니다.",
    )
    download_col1, download_col2, download_col3 = st.columns(3, gap="small")
    with download_col1:
        st.download_button(
            "TXT 다운로드",
            data=payload.txt_text.encode("utf-8"),
            file_name="parsed_task.txt",
            mime="text/plain",
            use_container_width=True,
        )
    with download_col2:
        st.download_button(
            "JSON 다운로드",
            data=payload.json_text.encode("utf-8"),
            file_name="parsed_task.json",
            mime="application/json",
            use_container_width=True,
        )
    with download_col3:
        st.download_button(
            "CSV 다운로드",
            data=payload.csv_text.encode("utf-8-sig"),
            file_name="parsed_task.csv",
            mime="text/csv",
            use_container_width=True,
        )


def render_compare_section() -> None:
    result = sync_result_from_editor()
    if result is None:
        return

    with st.expander("원문 / 결과 비교", expanded=False):
        left_col, right_col = st.columns(2, gap="large")
        with left_col:
            st.text_area("원문", value=st.session_state.raw_text_input, height=280)
        with right_col:
            st.json(result.to_dict(), expanded=False)


def render_history_section() -> None:
    section_header("History", "최근 결과", "세션 상태는 앱을 켜 둔 동안만 유지되는 임시 기억 공간입니다. 여기서는 최근 5건만 다시 불러올 수 있습니다.")
    history_items = st.session_state.history
    if not history_items:
        st.caption("아직 저장된 최근 결과가 없습니다.")
        return

    for item in history_items:
        row_col1, row_col2, row_col3, row_col4 = st.columns([5, 2, 1, 1], gap="small")
        due_label = item.get("due_date") or "미추출"
        row_col1.markdown(f"**{item['title']}**  \n기한: {due_label}")
        row_col2.caption(item["created_at"])
        if row_col3.button("불러오기", key=f"history_load_{item['id']}", use_container_width=True):
            loaded = load_history_entry(history_items, item["id"])
            if loaded:
                load_result_into_editor(loaded)
                st.rerun()
        if row_col4.button("삭제", key=f"history_delete_{item['id']}", use_container_width=True):
            st.session_state.history = remove_history_entry(history_items, item["id"])
            st.rerun()


def render_debug_section() -> None:
    if st.session_state.parsed_result is None:
        return

    section_header("Debug", "설정 / 디버그", "디버그는 일반 사용자에게는 숨기고, 규칙 검수할 때만 펼쳐 볼 수 있게 했습니다.")
    st.checkbox("개발자 모드", key="debug_toggle")
    if not st.session_state.debug_toggle:
        return

    result = sync_result_from_editor()
    if result is None:
        return

    log_col1, log_col2 = st.columns(2, gap="large")
    with log_col1:
        st.markdown("**파싱 로그**")
        st.code("\n".join(result.parse_logs) or "로그 없음", language="text")
    with log_col2:
        st.markdown("**신뢰도 / Raw JSON**")
        st.json(
            {
                "confidence": result.confidence.__dict__,
                "submit_method": result.submit_method,
                "raw_result": result.to_dict(),
            },
            expanded=False,
        )


def main() -> None:
    apply_custom_styles()
    init_session_state()
    render_header()
    render_input_section()
    render_action_section()
    if st.session_state.parsed_result is not None:
        render_result_summary()
        render_checklist_editor()
        render_contact_section()
        render_export_section()
        render_compare_section()
    render_history_section()
    render_debug_section()


main()
