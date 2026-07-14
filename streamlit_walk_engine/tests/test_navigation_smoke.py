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


def test_reroute_fetch_decoupled_from_interruptible_run():
    """재탐색 커밋 유실 근본수정(실기기 '재탐색 후 경로 수정 안 됨'):
    1초 autorefresh 가 경로 API(1.5~3초) 대기 중 실행을 중단시키면 이후 모든
    session_state 쓰기가 StopException 으로 유실됐다(E2E: fetch 22회 성공에도 경로
    불변·쿨다운 미기록 폭주). → fetch 는 백그라운드 스레드, 결과는 세션 밖
    _PENDING_REROUTE 에 보관, 다음 rerun 시작부에서 커밋. 쿨다운은 fetch '이전' 기록."""
    source = PAGE.read_text(encoding="utf-8")

    assert "_PENDING_REROUTE" in source
    # 보관소는 페이지 전역이 아니라 gps_filter(캐시된 모듈) 전역이어야 rerun 을 건너
    # 살아남는다 — 페이지 전역 dict 는 rerun 마다 초기화된다(E2E 실증 함정).
    assert "_PENDING_REROUTE = gps_filter.PENDING_REROUTE" in source
    assert "def _start_reroute_fetch(" in source
    assert "def _commit_pending_reroute(" in source
    # 매 rerun 시작부(autorefresh 직후)에서 커밋을 시도한다
    assert "_commit_pending_reroute()" in source
    # 게이트 통과 직후, fetch 시작 '전'에 쿨다운을 기록한다(커밋 유실 시 폭주 방지)
    gate = source.index("and not _reroute_suppressed")
    gate_block = source[gate:gate + 900]
    assert 'st.session_state["nav_last_reroute_ts_ms"] = now_ms' in gate_block
    assert "_start_reroute_fetch(" in gate_block
    # 재탐색 게이트 블록에서 동기 _fetch_route 호출이 사라졌다(중단 유실 경로 제거)
    assert "new_route  = _fetch_route(origin, dest_coord)" not in source
    # 워커 스레드는 st.session_state 를 만지지 않는다(고아 스레드 쓰기 금지 원칙)
    worker = source.index("def _work()")
    worker_block = source[worker:worker + 700]
    assert "st.session_state" not in worker_block


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


def test_gps_dedup_and_poll_age_match_one_second_polling():
    """P1-1: 같은 fix 멱등성 — maximumAge는 폴링 주기(1초)와 동일해야 하고(3000이면
    같은 캐시 fix 최대 3틱 재처리, 0이면 콜드 재취득으로 실효주기 악화), timestamp
    동일 fix는 틱 전체 skip(버퍼 append·blend·reject streak 증가 모두 생략)."""
    source = PAGE.read_text(encoding="utf-8")

    assert "maximumAge:1000" in source                       # 라이브 단일 fix 취득
    assert "maximumAge:3000" not in source                   # 옛 3초 캐시 제거
    assert "should_skip_duplicate_fix" in source             # dedup 가드 배선됨
    # 중복 fix가 '점프 기각' 분기로 새지 않는다(streak 오염 방지)
    assert "elif not dup_fix:" in source


def test_raw_judgment_display_smoothed_split():
    """P1-3: 판정 raw / 표시 smoothed 이원화 — nav_origin은 수용된 raw fix(엔진 샘플·
    도착·레그 전환·snap 판정), nav_display_origin은 스무딩 결과(지도 마커·현재위치
    카드). 표시 체인의 prev 앵커는 display(raw면 blend가 지터에 재오염)."""
    source = PAGE.read_text(encoding="utf-8")

    assert '"nav_display_origin": None' in source            # _init 키 등록
    # 수용 시: 판정은 raw, 표시는 smoothed로 분리 저장
    assert 'st.session_state["nav_origin"] = new_origin' in source
    assert 'st.session_state["nav_display_origin"] = smoothed' in source
    # 표시 스무딩 앵커는 이전 '표시' 좌표(raw prev 아님)
    assert 'disp_prev = st.session_state.get("nav_display_origin") or prev' in source
    # 정지 판정은 per-tick(moved < SMOOTH_STATIONARY_MOVE_M)이 아니라 버퍼 순변위
    assert "gps_filter.is_stationary(recent)" in source
    assert "moved < gps_filter.SMOOTH_STATIONARY_MOVE_M" not in source
    # 지도 현재위치 마커는 표시 좌표로 그린다
    assert "display_coord=st.session_state.get(\"nav_display_origin\")" in source


def test_gating_accuracy_stays_fresh_on_rejected_fixes():
    """P1-5: 게이팅용 accuracy(nav_gating_acc)는 수용/기각 무관 매 GPS 응답 갱신 —
    기각이 이어지는 신호 악화 구간에서 옛 '좋은' accuracy로 도착·레그 전환·snap이
    게이팅되던 문제. 위치 자체는 기각 시 미갱신 유지."""
    source = PAGE.read_text(encoding="utf-8")

    assert '"nav_gating_acc": None' in source                # _init 키 등록
    assert 'st.session_state["nav_gating_acc"] = acc' in source  # 응답마다 갱신
    assert "def _gating_accuracy()" in source
    # 도착·레그 전환·snap 세 곳이 최신 accuracy를 쓴다
    assert source.count("_gating_accuracy()") >= 4           # 정의 1 + 사용 3


def test_map_zoom_persists_across_reruns():
    """사용자가 지도를 확대/이동하면 1초 rerun 에도 유지되어야 한다(실기기 보고:
    확대해도 1초 뒤 원래대로 복귀). plotly uirevision + 고정 key 로 카메라를 보존하고,
    재탐색·새 경로에서만 revision 이 바뀌어 새 경로 기준으로 리셋된다."""
    source = PAGE.read_text(encoding="utf-8")

    assert "uirevision=ui_revision" in source               # _build_map 카메라 보존
    assert 'key="nav_map"' in source                        # 차트 컴포넌트 identity 고정
    assert "route-{st.session_state['nav_reroute_count']}" in source  # 재탐색 시에만 리셋
    assert 'uirevision="nav-placeholder"' in source         # 경로 전 지도도 유지
