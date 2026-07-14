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
    block = SRC[reset_at:reset_at + 700]
    assert '"nav_dest_display"' in block  # [18]
