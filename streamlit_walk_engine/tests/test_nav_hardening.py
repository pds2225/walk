# -*- coding: utf-8 -*-
"""오류 재발방지 하드닝 회귀 테스트 — 8차원 감사(31건)→적대검증(21건 확정)의 수정을 고정한다.

각 테스트는 '실사용에서 재현되던 결함'이 코드에 다시 들어오지 못하게 지킨다.
UI 파일은 프로젝트 관례(소스 어서션)로, 순수 모듈은 동작으로 검증한다.
"""
import io
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mapbox_matcher as mm  # noqa: E402
import snap_router as sr  # noqa: E402

PAGE = Path(__file__).resolve().parents[1] / "pages" / "1_Navigation.py"
SRC = PAGE.read_text(encoding="utf-8")


# ── snap_router: 이탈 확정은 횡거리가 '지속'될 때만 (정지 드리프트/스파이크 오확정 방지) ──
def test_offroute_confirm_requires_persistent_offset():
    # 마지막 표본만 25m(직전은 5m) = 단발 스파이크 → 확정 금지(DEFER/기타)
    win = [
        sr.SnapSample(along_m=100 + 0.2 * i, offset_m=5.0, ts_ms=1000 * i,
                      moved_m=(0.0 if i == 0 else 5.0))
        for i in range(5)
    ]
    win[-1] = sr.SnapSample(along_m=101.0, offset_m=25.0, ts_ms=5000, moved_m=5.0)
    assert sr.classify(win, net_move_m=20.0) != sr.OFF_ROUTE_CONFIRMED
    # 직전 표본도 큰 횡거리(지속) → 확정 유지
    win[-2] = sr.SnapSample(along_m=100.8, offset_m=20.0, ts_ms=4000, moved_m=5.0)
    assert sr.classify(win, net_move_m=20.0) == sr.OFF_ROUTE_CONFIRMED


# ── mapbox_matcher: 형식 이상 응답이 안내 루프를 죽이지 않는다 ─────────────────
def test_malformed_mapbox_reply_returns_none(monkeypatch):
    monkeypatch.setattr(mm, "_token", lambda: "pk.test")

    class _FakeResp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    bad = json.dumps({"code": "Ok", "matchings": [
        {"confidence": 0.9, "geometry": {"coordinates": [["x", "y"]]}}  # float() 불가 타입
    ]}).encode("utf-8")
    monkeypatch.setattr(mm._urlrequest, "urlopen",
                        lambda req, timeout: _FakeResp(bad))
    coords = [(126.978 + i * 0.0001, 37.5665 + i * 0.0001) for i in range(6)]
    assert mm.match_trace(coords) is None  # 크래시 대신 판단 보류


# ── 재탐색 게이트: 저정확도·passed_turn·Mapbox 3상·억제 시간상한 ────────────────
def test_reroute_gate_hardening_wiring():
    gate = SRC[SRC.index("def _reroute_suppressed"):]
    gate = gate[:gate.index("def _trigger_alert")]
    # [1] 저정확도 이탈은 알림처럼 보류(무료 폴백)
    assert "gps_filter.FAIR_ACCURACY_M" in gate
    # [7] 회전 미이행은 횡거리 억제에 눌리지 않는다
    assert 'deviation_state == "passed_turn"' in gate
    # [8] Mapbox 판단불가(None)는 무료 기본값으로 폴백(3상)
    assert "_mapbox_confirms_deviation" in gate
    assert "verdict is True" in gate and "verdict is False" in gate
    # [3] ON_ROUTE_LIKELY 억제 시간상한(평행도로 영구 놓침 방지)
    assert "_SNAP_SUPPRESS_MAX_MS" in gate
    # 호출부가 이탈 상태를 넘긴다
    assert "now_ms, result.state)" in SRC


def test_mapbox_helper_is_tristate_and_guarded():
    h = SRC[SRC.index("def _mapbox_confirms_deviation"):]
    h = h[:h.index("\ndef ")]
    assert "return None" in h            # 토큰 없음/부족 → 판단불가(하드 거부 아님)
    assert "except Exception" in h       # [19] 확인층 이상이 안내 루프를 못 죽임


# ── 백그라운드 복귀: 엔진 리셋 + median 버퍼 flush + 신선도 표시 ────────────────
def test_background_gap_hardening():
    assert "_GPS_GAP_RESET_MS" in SRC
    assert "sample.timestamp_ms - prev_ts > _GPS_GAP_RESET_MS" in SRC   # [9]
    assert "del recent[:-1]" in SRC                                      # [10]
    assert "_FIX_STALE_MS" in SRC and "nav_fix_received_ms" in SRC       # [12]


# ── 시계 혼합 금지: 워밍업·도착 소요시간은 클라이언트 fix 시계끼리만 ───────────
def test_single_clock_for_warmup_and_elapsed():
    # [13][14] 워밍업: 서버 now_ms 와 fix ts 를 빼지 않는다
    assert "(nav_samples[-1].timestamp_ms - nav_samples[0].timestamp_ms)" in SRC
    assert "now_ms - nav_samples[0].timestamp_ms" not in SRC
    # [15] 도착 소요: 끝시각도 샘플 시계
    assert "end_ts = samples[-1].timestamp_ms if samples else" in SRC


# ── 다구간 여정: 수동 탈출구·종료·전체 집계 ───────────────────────────────────
def test_journey_lifecycle_hardening():
    # [0] 추적 도보 레그에도 수동 '다음 구간' 버튼(역 입구 GPS 저정확도 탈출구)
    j = SRC[SRC.index("active_leg = journey.legs[active_index]"):]
    j = j[:j.index("def _route_summary_text")]
    assert "if active_index < len(journey.legs) - 1:" in j
    # [4] 마지막 대중교통/미추적 구간 수동 종료
    assert "도착했어요 · 안내 종료" in j
    # [6] 여정 종료 시 journey 정리(예약 자동활성화 가드 해제)
    fin = SRC[SRC.index("def _maybe_finish_arrival"):]
    fin = fin[:fin.index("def _make_sample")]
    assert "_clear_journey_state()" in fin
    # [16][17][20] 여정 전체 소요·누적 재탐색 키
    assert "nav_journey_start_ts_ms" in SRC
    assert "nav_journey_reroute_total" in SRC


# ── 예약 자동활성화: 유휴 폴링 유지 + 활성화 직후 rerun ───────────────────────
def test_booking_activation_hardening():
    # [5] 예약 있으면 유휴에도 autorefresh + GPS 폴링
    assert "_booking_armed" in SRC
    poll = SRC[SRC.index("need_gps_poll = ("):]
    poll = poll[:poll.index("if need_gps_poll")]
    assert "nav_route_bookings" in poll
    # [11] 활성화 성공 시 rerun (except 가 RerunException 을 삼키지 않게 플래그 방식)
    b = SRC[SRC.index("def _try_activate_booking"):]
    b = b[:b.index("# ── 사이드바")]
    assert "activated = True" in b and "if activated:" in b and "st.rerun()" in b


# ── 초기화: 목적지 배너 잔존 방지 ─────────────────────────────────────────────
def test_reset_clears_dest_banner():
    reset_at = SRC.index('if st.button("↺ 초기화"')
    block = SRC[reset_at:reset_at + 1100]
    assert '"nav_dest_display"' in block  # [18]
    # 초기화는 대기 중인 자동 재개·저장된 안내 세션도 지운다(되살아나지 않게).
    assert '"nav_resume_pending"] = None' in block
    assert "removeItem('walk_navi_active_session')" in block or "_LS_KEY_ACTIVE" in block


# ── 폰 잠금·새로고침 복귀: 화면 꺼짐 방지 + 안내 세션 자동 재개 ────────────────
def test_wake_lock_wired():
    wl = SRC[SRC.index("def _apply_wake_lock"):]
    wl = wl[:wl.index("def _save_active_session")]
    # 스크린 웨이크락 요청 + hidden 복귀 재획득(visibilitychange) + 미지원 예외 무시
    assert "wakeLock.request('screen')" in wl
    assert "visibilitychange" in wl
    assert "catch (e)" in wl
    # 안내 중일 때만 잡고, 진행/도착 확정 뒤 한 번 호출된다(early return 앞).
    assert "_apply_wake_lock(_running_now)" in SRC


def test_active_session_persist_and_restore_wired():
    save = SRC[SRC.index("def _save_active_session"):]
    save = save[:save.index("def _restore_active_session")]
    # 안내 중이면 목적지 저장, 아니면 삭제(중지·초기화·도착 자동 정리)
    assert "_LS_KEY_ACTIVE" in save
    assert "removeItem" in save and "setItem" in save
    # 매 rerun 재주입 방지 스로틀(직렬화 서명 비교)
    assert "nav_active_saved_sig" in save

    restore = SRC[SRC.index("def _restore_active_session"):]
    restore = restore[:restore.index("# ── 알림")]
    # 이미 안내/경로 있으면 복원 안 함 + 세션당 1회 + 오래된 세션 만료
    assert "nav_active_restore_tried" in restore
    assert "_ACTIVE_SESSION_MAX_AGE_MS" in restore
    assert "nav_resume_pending" in restore

    # main: 부트스트랩 호출 + origin 확보 후 자동 재개(start_now=True)
    assert "_restore_active_session()" in SRC
    assert "_save_active_session()" in SRC
    resume = SRC[SRC.index('resume = st.session_state.get("nav_resume_pending")'):]
    resume = resume[:resume.index('st.markdown("## 🚶 도보 내비게이션")')]
    assert "_activate_route(resume_origin" in resume
    assert "_activate_journey(journey, start_now=True)" in resume
    # 사용자가 그새 새 목적지를 잡았으면 복원을 취소(저장 세션이 새 선택을 덮지 않게).
    assert 'st.session_state.get("nav_route") is not None' in resume
    assert 'st.session_state.get("nav_journey") is not None' in resume
    # 성공했을 때만 pending 소비 + 실패는 상한까지 재시도(무한 fetch·영구 유실 방지).
    assert "_RESUME_MAX_ATTEMPTS" in resume
    assert "nav_resume_attempts" in resume


# ── 걷는 방향 보정: 원형 평균 스무딩을 지도 화살표·헤딩업에 적용 ───────────────
def test_heading_smoothing_wired():
    # 이동 표본의 heading 만 버퍼에 쌓아 smooth_heading 으로 보정값 갱신
    assert "nav_heading_buf" in SRC
    assert "gps_filter.smooth_heading(buf)" in SRC
    assert "gps_filter.HEADING_SMOOTH_WINDOW" in SRC
    # 지도 화살표·헤딩업 방위 모두 보정값을 우선 사용
    hb = SRC[SRC.index("def _heading_up_bearing"):]
    hb = hb[:hb.index("def _build_map_deck")]
    assert 'st.session_state.get("nav_smoothed_heading")' in hb


# ── 목적지 안 나오는 일 없게: 자동완성 비어도 입력 텍스트 유지 ────────────────
def test_dest_typed_text_kept_when_no_suggestion():
    di = SRC[SRC.index("def _render_dest_inputs"):]
    di = di[:di.index("st.text_input(")]
    # searchbox 후보 미선택 시 입력 검색어를 nav_dest_input 에 남겨 버튼 활성/폴백 가능
    assert 'sb.get("search")' in di
    assert 'st.session_state["nav_dest_input"] = typed' in di
