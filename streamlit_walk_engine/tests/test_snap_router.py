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


# ── net_move_m 미제공(None): 이동경로 합으로 보수적 대체 ──────────────────────
# 실사용 호출부가 순변위를 못 넘기는 경우(디폴트 None). 이땐 total_path 를 순변위로
# 대체(과대평가) → '정지'로 오판하지 않는 안전측. 이 대체 경로가 전량 미테스트였다.
def test_net_move_none_advancing_is_on_route_likely():
    # net_move_m 없이도 total_path(=16)로 진행 판정 → 코리도어 안이면 뒷단 위임
    win = _win([100, 104, 108, 112, 116], offset=25, moved=4)
    assert sr.classify(win) == sr.ON_ROUTE_LIKELY


def test_net_move_none_still_confirms_clear_offroute():
    # 진행 정체 + 지속 큰 횡거리 + 실이동(대체값=20) → net_move 미제공이어도 이탈 확정
    win = _win([100, 100.3, 100.6, 100.8, 101.0], offset=25, moved=5)
    assert sr.classify(win) == sr.OFF_ROUTE_CONFIRMED


def test_net_move_none_does_not_falsely_mark_stationary():
    # 대체값은 순변위를 과대평가하므로, 제자리 흔들림이라도 '정지'로 단정하지 않는다
    # (안전측 절충 — 실제 정지 판정엔 호출부가 순변위를 넘겨야 한다).
    win = _win([100, 101, 100, 101, 100, 101], offset=26, moved=5)
    assert sr.classify(win) != sr.STATIONARY


# ── 미테스트 분기 회귀(야간 점검): 후퇴 경계·미세 윈도·동일점 가드 ──────────────
def test_backward_along_jump_defers_not_confirms():
    # 왕복/재스냅으로 진행도가 물리 이동보다 훨씬 크게 '후퇴'(-200m)해도
    # 이탈 확정 금지 → 보류(뒷단 위임). 기존 테스트는 전진 점프만 다뤘다.
    win = _win([300, 250, 180, 130, 100], offset=25, moved=4)
    assert sr.classify(win, net_move_m=15.0) == sr.DEFER


def test_retreat_beyond_net_move_defers():
    # 후퇴량(20m)이 순변위(15m)를 초과 = 진행도 신뢰 불가 → 확정하지 않고 보류.
    # 완만후퇴 확정(test_modest_reverse_confirms: -8m vs 순변위 20m)과 경계쌍.
    win = _win([100, 95, 90, 85, 80], offset=30, moved=5)
    assert sr.classify(win, net_move_m=15.0) == sr.DEFER


def test_tiny_window_low_direction_is_not_stationary():
    # 이동경로 합이 STATIONARY_MIN_PATH_M(3m) 미만이면 방향성이 낮아도 '정지' 단정 금지
    # (작은 윈도 노이즈로 정지 오판 → 진짜 이탈 후보를 무료층이 삼키는 것 방지).
    win = _win([100, 100.2, 100.4], offset=5, moved=0.9)
    out = sr.classify(win, net_move_m=0.5)
    assert out != sr.STATIONARY
    assert out == sr.DEFER


def test_all_identical_points_no_crash_and_defers():
    # 전 표본 동일점(total_path=0) → 방향성 나눗셈 가드(1e-6)로 크래시 없이 보류.
    # 정지 중 큰 횡거리 편향(20m)이라도 실이동(순변위 0)이 없으면 확정하지 않는다.
    win = _win([100, 100, 100, 100], offset=20, moved=0)
    assert sr.classify(win) == sr.DEFER
