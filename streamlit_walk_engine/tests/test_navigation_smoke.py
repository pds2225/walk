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
    # '대중교통 포함' 토글은 출발 버튼 2개(걷기/대중교통+걷기)로 대체됐다.
    labels = [b.label for b in app.button]
    assert any("🚶 걷기" in lb for lb in labels)
    assert any("대중교통+걷기" in lb for lb in labels)


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

    assert '"연속 감지 횟수", 1, 5, 3' in source           # 1초 샘플링 × 3회 ≈ 3초 확정
    assert "minimum_drift_duration_ms=2000" in source       # 지속시간 경로도 3번째 표본과 일치
    # 안내 중 1초 폴링(사용자 지정) — 유휴는 10초 유지(배터리·API 절약)
    assert 'interval=1000 if st.session_state["nav_running"] else 10_000' in source


def test_reroute_cooldown_is_three_seconds():
    """연속 재탐색 방지 쿨다운(폭주 방지 안전벨트) = 3초. 값 자체는 재탐색 빈도에
    거의 영향 없음(워밍업·재중심화가 지배) — 근본 개선은 맵매칭이 필요."""
    source = PAGE.read_text(encoding="utf-8")

    assert "_REROUTE_COOLDOWN_MS = 3_000" in source
    assert "> _REROUTE_COOLDOWN_MS" in source                # 하드코딩 상수 사용
    assert "(3초 쿨다운)" in source                          # 도움말 문구 일치


def test_transit_toggle_does_not_use_session_key_as_widget_key():
    """세션 저장키를 토글의 위젯 key 로 쓰면 안내 중 미렌더되어 Streamlit 이 그 키를
    GC하고, 다음 rerun 의 _init() 이 기본값 True 로 되살린다 →
    사용자가 끈 '도보 전용' 설정이 매 주행마다 소실된다."""
    source = PAGE.read_text(encoding="utf-8")

    assert 'key="nav_transit_enabled"' not in source
    # 토글 대신 출발 버튼 2개가 세션에 직접 대입한다(위젯키 미사용 원칙 유지).
    assert 'st.session_state["nav_transit_enabled"] = False' in source
    assert 'st.session_state["nav_transit_enabled"] = True' in source


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


def test_turn_direction_voice_announcement():
    """다음 회전 10m 앞에서 '잠시 후 좌/우회전입니다'를 회전점당 1회 예고한다.
    (10m = 시뮬 720회 실측으로 보통 걸음 평균 9초 전 — 30m 는 24초 전이라 너무 일렀음.
    상태 경고와 별개인 '어디로 가라' 음성, 반복 발화 방지 id 가드, 재탐색 시 리셋.)"""
    source = PAGE.read_text(encoding="utf-8")

    assert "_TURN_ANNOUNCE_M = 10.0" in source
    assert "잠시 후 {label}입니다." in source
    assert "_maybe_announce_turn(result" in source          # GPS 처리 루프에 배선됨
    assert source.count('"nav_turn_announced_id"') >= 3     # 기본값·가드·재탐색 리셋


def test_reroute_success_announced_by_voice():
    """재탐색 성공이 화면 토스트뿐이면 폰을 안 보는 보행자는 새 경로를 찾았는지 알 수
    없다(실기기 보고) — 재탐색 성공 블록 안에서 TTS 로도 알린다(음성 안내 토글 존중)."""
    source = PAGE.read_text(encoding="utf-8")
    start = source.index('"nav_reroute_count":       new_count')
    block = source[start:start + 1600]

    assert "경로를 다시 찾았습니다. 새 경로로 안내합니다." in block
    assert 'st.session_state["nav_tts_enabled"]' in block   # 음성 토글 존중
