import os
from pathlib import Path

from streamlit.testing.v1 import AppTest


PAGE = Path(__file__).resolve().parents[1] / "pages" / "1_Navigation.py"


def test_navigation_page_renders_with_transit_toggle():
    app = AppTest.from_file(str(PAGE))
    # 페이지 렌더가 환경(네트워크·컴포넌트)에 따라 3~12초로 출렁여 timeout=10은
    # 간헐적으로 터진다. 행(hang) 감지 목적은 유지하되 여유를 둔다.
    app.run(timeout=30)

    assert not app.exception
    assert any("대중교통 포함" in toggle.label for toggle in app.toggle)


def test_navigation_source_clears_journey_for_non_journey_flows():
    source = PAGE.read_text(encoding="utf-8")

    assert 'st.session_state.get("nav_journey") is not None' in source
    assert "_clear_journey_state()" in source
    assert "transit_builder.advance_leg" in source
    assert "transit_builder.fetch_transit_journey" in source


def test_transit_toggle_does_not_use_session_key_as_widget_key():
    """세션 저장키를 토글의 위젯 key 로 쓰면 안내 중 미렌더되어 Streamlit 이 그 키를
    GC하고, 다음 rerun 의 _init() 이 기본값 True 로 되살린다 →
    사용자가 끈 '도보 전용' 설정이 매 주행마다 소실된다."""
    source = PAGE.read_text(encoding="utf-8")

    assert 'key="nav_transit_enabled"' not in source
    # value=세션값 → 반환값을 세션에 대입하는 패턴(위젯키 미사용)이어야 한다.
    assert 'st.session_state["nav_transit_enabled"] = transit_on' in source


def test_reset_button_clears_active_booking_id():
    """도착 전 ↺ 초기화 시 nav_active_booking_id 가 남으면 _try_activate_booking 이
    계속 건너뛰어 그 세션 동안 예약 경로가 다시 자동활성화되지 않는다."""
    source = PAGE.read_text(encoding="utf-8")

    assert 'st.session_state["nav_active_booking_id"] = None' in source


def test_recent_chip_reroute_respects_transit_setting():
    """최근 검색 칩 재탐색이 '대중교통 포함'을 무시하고 도보 전용으로만 가면
    '바로 출발'과 동작이 갈린다 — pending_hist 처리부도 설정을 존중해야 한다."""
    source = PAGE.read_text(encoding="utf-8")
    start = source.index('pending_hist = st.session_state.get("nav_pending_hist")')
    block = source[start:start + 1800]

    assert "transit_builder.fetch_transit_journey" in block
    assert "_activate_journey" in block
