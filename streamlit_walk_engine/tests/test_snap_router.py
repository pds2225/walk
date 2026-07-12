# -*- coding: utf-8 -*-
"""snap_router 단위 테스트 — 진행도·순변위 기반 이탈 상태 판정.

적대적 검증(워크플로)이 잡은 결함을 회귀로 고정한다:
· 정지 판정은 '이동경로 합'이 아니라 '순변위'로 — 상류 1m 표본 게이트를 통과해도 견고.
· 진행 중 + 코리도어 = ON_ROUTE_LIKELY(뒷단 Mapbox 위임) — 하드 거부 아님.
· U자/왕복 along 점프는 DEFER, GPS 정확도 불량은 '확정'만 보류(하드 거부 아님).
외부 데이터·네트워크 없이 검증한다.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import snap_router as sr  # noqa: E402


def _win(alongs, offset, moved):
    return [
        sr.SnapSample(along_m=a, offset_m=offset, ts_ms=1000 * i, moved_m=(0.0 if i == 0 else moved))
        for i, a in enumerate(alongs)
    ]


# ── 진행 중(지터 vs 평행 구분 불가) → 뒷단 위임 ──────────────────────────────
def test_advancing_in_corridor_is_on_route_likely():
    win = _win([100, 104, 108, 112, 116], offset=25, moved=4)
    assert sr.classify(win, net_move_m=16.0) == sr.ON_ROUTE_LIKELY


def test_advancing_large_offset_defers():
    # 횡거리 45m(>=40 코리도어) → 평행도로 의심 → DEFER(뒷단)
    win = _win([100, 104, 108, 112, 116], offset=45, moved=4)
    assert sr.classify(win, net_move_m=16.0) == sr.DEFER


def test_sim_sustained_bias_advancing_is_on_route_likely():
    # 도심 빌딩반사 26~30m 편향에도 북쪽으로 계속 진행 → ON_ROUTE_LIKELY(뒷단 판단/무 Mapbox시 지터로 거부)
    for off in (26.0, 28.0, 30.0):
        win = _win([0, 4.2, 8.4, 12.6, 16.8], offset=off, moved=4.2)
        assert sr.classify(win, net_move_m=16.8) == sr.ON_ROUTE_LIKELY


# ── 정지: 순변위 기준(상류 1m 게이트로 이동합은 커도 견고) ────────────────
def test_stationary_by_net_displacement_even_with_meter_scale_jitter():
    # 각 표본 5m 이동(>1m 게이트 통과)이지만 제자리 흔들림 → 순변위 2m → STATIONARY
    win = _win([100, 101, 100, 101, 100, 101], offset=26, moved=5)
    assert sr.classify(win, net_move_m=2.0) == sr.STATIONARY


def test_slow_offroute_not_masked_as_stationary():
    # 느린 실이탈(방향성 있는 이동) → 순변위/경로비 높음 → 정지 아님 → 이탈 확정
    win = _win([100, 100.3, 100.6, 100.8, 101.0], offset=20, moved=1.2)
    assert sr.classify(win, net_move_m=6.0) == sr.OFF_ROUTE_CONFIRMED


# ── 진짜 이탈 확정 ───────────────────────────────────────────────────────────
def test_stall_large_offset_confirms():
    win = _win([100, 100.3, 100.6, 100.8, 101.0], offset=25, moved=5)
    assert sr.classify(win, net_move_m=20.0) == sr.OFF_ROUTE_CONFIRMED


def test_modest_reverse_confirms():
    win = _win([100, 98, 96, 94, 92], offset=30, moved=5)
    assert sr.classify(win, net_move_m=20.0) == sr.OFF_ROUTE_CONFIRMED


# ── U자/왕복 스냅 점프·정확도 불량은 '확정'하지 않고 보류 ────────────────
def test_uturn_along_jump_defers():
    # along 이 물리 이동보다 훨씬 크게 점프(전역 최근접 세그먼트 튐) → DEFER
    win = _win([100, 130, 180, 250, 300], offset=25, moved=4)
    assert sr.classify(win, net_move_m=15.0) == sr.DEFER


def test_bad_accuracy_blocks_confirm_but_not_hard_veto():
    # 정확도 불량이면 '이탈 확정' 보류(DEFER) — 예전처럼 무조건 거부하지 않는다
    win = _win([100, 100.3, 100.6, 100.8, 101.0], offset=25, moved=5)
    assert sr.classify(win, net_move_m=20.0, latest_accuracy_m=50.0) == sr.DEFER


def test_bad_accuracy_advancing_still_on_route_likely():
    # 정확도 불량 + 진행 중 → 여전히 ON_ROUTE_LIKELY(하드 거부 아님, 뒷단 위임)
    win = _win([100, 104, 108, 112, 116], offset=25, moved=4)
    assert sr.classify(win, net_move_m=16.0, latest_accuracy_m=50.0) == sr.ON_ROUTE_LIKELY


def test_insufficient_window_defers():
    win = _win([100, 104], offset=25, moved=4)  # 2개 < MIN_WINDOW(3)
    assert sr.classify(win, net_move_m=4.0) == sr.DEFER
