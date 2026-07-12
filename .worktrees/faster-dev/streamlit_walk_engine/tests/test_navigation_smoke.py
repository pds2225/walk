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


def test_deviation_confirmation_defaults_are_faster():
    """이탈 확정을 더 빨리 알리도록 기본 연속 2샘플·지속 2초로 설정한다.
    (deviated = 연속샘플 OR 지속시간 둘 중 먼저 충족되므로 둘 다 낮춰야 체감이 빨라진다.)"""
    source = PAGE.read_text(encoding="utf-8")

    assert 'st.slider("연속 샘플", 1, 5, 2)' in source     # 기본 3 → 2
    assert "minimum_drift_duration_ms=2000" in source       # 기본 4000 → 2000


def test_transit_toggle_does_not_use_session_key_as_widget_key():
    """세션 저장키를 토글의 위젯 key 로 쓰면 안내 중 미렌더되어 Streamlit 이 그 키를
    GC하고, 다음 rerun 의 _init() 이 기본값 True 로 되살린다 →
    사용자가 끈 '도보 전용' 설정이 매 주행마다 소실된다."""
    source = PAGE.read_text(encoding="utf-8")

    assert 'key="nav_transit_enabled"' not in source
    # value=세션값 → 반환값을 세션에 대입하는 패턴(위젯키 미사용)이어야 한다.
    assert 'st.session_state["nav_transit_enabled"] = transit_on' in source


def test_booking_rearms_only_after_leaving_start_radius():
    """예약 재활성화 정책:
    - 출발 반경 안에 서 있는 동안엔 재발동을 억제한다(도착 전 ↺ 초기화 직후
      5초 뒤 예약이 자동 재시작되어 초기화가 무력화되는 루프 방지).
    - 반경을 벗어나면 nav_active_booking_id 를 재무장해, 다시 출발지로 오면
      정상 활성화된다(그 세션 동안 영영 못 쓰던 문제 해소).
    """
    source = PAGE.read_text(encoding="utf-8")
    start = source.index("def _try_activate_booking")
    block = source[start:start + 1400]

    assert "outside = distance_meters(origin, start)" in block
    assert 'if outside:\n                st.session_state["nav_active_booking_id"] = None' in block
    # 초기화 핸들러는 id 를 지우지 않아야 한다(루프 방지).
    reset_at = source.index('if st.button("↺ 초기화"')
    reset_block = source[reset_at:reset_at + 700]
    assert 'st.session_state["nav_active_booking_id"] = None' not in reset_block


def test_recent_chip_reroute_respects_transit_setting():
    """최근 검색 칩 재탐색이 '대중교통 포함'을 무시하고 도보 전용으로만 가면
    '바로 출발'과 동작이 갈린다 — pending_hist 처리부도 설정을 존중해야 한다."""
    source = PAGE.read_text(encoding="utf-8")
    start = source.index('pending_hist = st.session_state.get("nav_pending_hist")')
    block = source[start:start + 1800]

    assert "transit_builder.fetch_transit_journey" in block
    assert "_activate_journey" in block
