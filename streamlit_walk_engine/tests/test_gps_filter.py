"""
Unit tests for gps_filter.py — accuracy 기반 3단계 알림 게이팅 순수 함수 검증.

커버 범위:
  accuracy_quality  → 경계값 (≤15 good / ≤35 fair / 초과 poor / None unknown)
  alert_level       → full/weak/mute 분기 + drifting 사각지대(의도적 mute) + 커스텀 게이트
  decide_alert      → 상태 전이 게이트, mute 미갱신(회복-재발화), weak 쿨다운, alert_enabled OFF 보존
  is_arrival        → 도착 반경/accuracy 경계, poor accuracy 억제, 커스텀 반경
  in_reroute_warmup → 시작 직후 재경로 금지 구간 (샘플 수/경과 시간 동시 조건)
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from gps_filter import (
    GOOD_ACCURACY_M,
    FAIR_ACCURACY_M,
    ALERT_ACCURACY_GATE_M,
    WEAK_TOAST_COOLDOWN_MS,
    ARRIVAL_RADIUS_M,
    REROUTE_WARMUP_SAMPLES,
    REROUTE_WARMUP_MS,
    accuracy_quality,
    alert_level,
    decide_alert,
    is_arrival,
    in_reroute_warmup,
)


class TestConstants:
    def test_constant_values(self):
        assert GOOD_ACCURACY_M == 15.0
        assert FAIR_ACCURACY_M == 35.0
        assert ALERT_ACCURACY_GATE_M == 15.0
        assert WEAK_TOAST_COOLDOWN_MS == 15_000


class TestAccuracyQuality:
    # (a) 경계값: 경계 포함(≤) 확인
    def test_good_below_boundary(self):
        assert accuracy_quality(10) == "good"

    def test_good_at_boundary(self):
        assert accuracy_quality(15) == "good"

    def test_fair_below_boundary(self):
        assert accuracy_quality(30) == "fair"

    def test_fair_at_boundary(self):
        assert accuracy_quality(35) == "fair"

    def test_poor(self):
        assert accuracy_quality(50) == "poor"

    def test_none_is_unknown(self):
        assert accuracy_quality(None) == "unknown"


class TestAlertLevel:
    # (b) 나쁜 정확도 + on_route → mute
    def test_poor_accuracy_on_route_is_mute(self):
        assert alert_level(40, "on_route") == "mute"

    # (c) 양호한 정확도 → 어떤 state든 full
    def test_good_accuracy_any_state_is_full(self):
        for state in ("on_route", "drifting", "deviated", "passed_turn"):
            assert alert_level(10, state) == "full"

    # (d) accuracy 미보고(수동 입력 등) → 기존 동작 보존 = full
    def test_none_accuracy_is_full(self):
        assert alert_level(None, "deviated") == "full"

    # (e) 나쁜 정확도 + 확정 이탈 → weak
    def test_poor_accuracy_deviated_is_weak(self):
        assert alert_level(40, "deviated") == "weak"

    def test_poor_accuracy_passed_turn_is_weak(self):
        assert alert_level(40, "passed_turn") == "weak"

    # (e2) 나쁜 정확도 + drifting → mute (heading 사각지대 — 의도된 설계 결정 고정)
    def test_poor_accuracy_drifting_is_mute(self):
        assert alert_level(40, "drifting") == "mute"

    # 게이트 경계 포함(≤) 확인: 정확히 15.0이면 full
    def test_gate_boundary_inclusive_is_full(self):
        assert alert_level(15.0, "deviated") == "full"

    # (j) 커스텀 게이트
    def test_custom_gate_full(self):
        assert alert_level(18, "deviated", accuracy_gate_m=20.0) == "full"

    def test_custom_gate_weak(self):
        assert alert_level(25, "deviated", accuracy_gate_m=20.0) == "weak"

    def test_custom_gate_mute(self):
        assert alert_level(25, "on_route", accuracy_gate_m=20.0) == "mute"


T = 1_000_000  # 기준 시각(ms)


class TestDecideAlertMute:
    # (f) mute: 미발화 + last_alerted 미갱신(안전 측 기본값)
    def test_mute_does_not_consume_transition(self):
        decision = decide_alert(
            state="deviated",
            last_alerted="on_route",
            level="mute",
            now_ms=T,
            last_weak_ts_ms=None,
            alert_enabled=True,
        )
        assert decision.fire_full is False
        assert decision.fire_weak_toast is False
        assert decision.new_last_alerted == "on_route"
        assert decision.new_last_weak_ts_ms is None

    # (g) 회복-재발화: mute 직후 accuracy 회복 → 같은 전이로 full 발화
    def test_recovery_refires_full(self):
        decision = decide_alert(
            state="deviated",
            last_alerted="on_route",
            level="full",
            now_ms=T + 1000,
            last_weak_ts_ms=None,
            alert_enabled=True,
        )
        assert decision.fire_full is True
        assert decision.new_last_alerted == "deviated"


class TestDecideAlertWeakCooldown:
    # (h) weak 쿨다운 시퀀스
    def test_first_weak_fires_and_records_ts(self):
        decision = decide_alert(
            state="deviated",
            last_alerted="on_route",
            level="weak",
            now_ms=T,
            last_weak_ts_ms=None,
            alert_enabled=True,
        )
        assert decision.fire_weak_toast is True
        assert decision.fire_full is False
        assert decision.new_last_alerted == "deviated"
        assert decision.new_last_weak_ts_ms == T

    def test_weak_within_cooldown_suppressed_but_state_recorded(self):
        decision = decide_alert(
            state="deviated",
            last_alerted="on_route",
            level="weak",
            now_ms=T + 5000,
            last_weak_ts_ms=T,
            alert_enabled=True,
        )
        assert decision.fire_weak_toast is False
        assert decision.fire_full is False
        # 동일 state 재토글 방지를 위해 last_alerted는 갱신
        assert decision.new_last_alerted == "deviated"
        assert decision.new_last_weak_ts_ms == T

    def test_weak_after_cooldown_fires_again(self):
        decision = decide_alert(
            state="deviated",
            last_alerted="on_route",
            level="weak",
            now_ms=T + 20000,
            last_weak_ts_ms=T,
            alert_enabled=True,
        )
        assert decision.fire_weak_toast is True
        assert decision.new_last_alerted == "deviated"
        assert decision.new_last_weak_ts_ms == T + 20000


class TestDecideAlertNoTransition:
    # (i) state == last_alerted → 미발화·불변 (full/weak 공통)
    def test_full_no_transition(self):
        decision = decide_alert(
            state="deviated",
            last_alerted="deviated",
            level="full",
            now_ms=T,
            last_weak_ts_ms=12345,
            alert_enabled=True,
        )
        assert decision.fire_full is False
        assert decision.fire_weak_toast is False
        assert decision.new_last_alerted == "deviated"
        assert decision.new_last_weak_ts_ms == 12345

    def test_weak_no_transition(self):
        decision = decide_alert(
            state="deviated",
            last_alerted="deviated",
            level="weak",
            now_ms=T + 100_000,  # 쿨다운 경과여도 전이가 없으면 미발화
            last_weak_ts_ms=12345,
            alert_enabled=True,
        )
        assert decision.fire_full is False
        assert decision.fire_weak_toast is False
        assert decision.new_last_alerted == "deviated"
        assert decision.new_last_weak_ts_ms == 12345

    def test_mute_no_transition(self):
        decision = decide_alert(
            state="on_route",
            last_alerted="on_route",
            level="mute",
            now_ms=T,
            last_weak_ts_ms=None,
            alert_enabled=True,
        )
        assert decision.fire_full is False
        assert decision.fire_weak_toast is False
        assert decision.new_last_alerted == "on_route"
        assert decision.new_last_weak_ts_ms is None


class TestDecideAlertDisabled:
    # (k) alert_enabled=False → 전이를 '소비'하지 않고 전부 보존
    def test_disabled_preserves_everything(self):
        decision = decide_alert(
            state="deviated",
            last_alerted="on_route",
            level="full",
            now_ms=T,
            last_weak_ts_ms=777,
            alert_enabled=False,
        )
        assert decision.fire_full is False
        assert decision.fire_weak_toast is False
        assert decision.new_last_alerted == "on_route"
        assert decision.new_last_weak_ts_ms == 777

    def test_reenabled_fires_normally(self):
        decision = decide_alert(
            state="deviated",
            last_alerted="on_route",
            level="full",
            now_ms=T,
            last_weak_ts_ms=777,
            alert_enabled=True,
        )
        assert decision.fire_full is True
        assert decision.new_last_alerted == "deviated"

    def test_disabled_blocks_weak_too(self):
        decision = decide_alert(
            state="deviated",
            last_alerted="on_route",
            level="weak",
            now_ms=T,
            last_weak_ts_ms=None,
            alert_enabled=False,
        )
        assert decision.fire_weak_toast is False
        assert decision.new_last_alerted == "on_route"
        assert decision.new_last_weak_ts_ms is None


class TestIsArrival:
    # 도착 판정: 반경(20m) 이내 + accuracy fair(≤35m) 이하일 때만 True
    def test_within_radius_good_accuracy(self):
        assert is_arrival(15.0, 10.0) is True

    def test_at_radius_boundary(self):
        assert is_arrival(ARRIVAL_RADIUS_M, 10.0) is True

    def test_outside_radius(self):
        assert is_arrival(ARRIVAL_RADIUS_M + 0.1, 5.0) is False

    def test_accuracy_none_passes(self):
        # 수동 입력 등 accuracy 미보고 — 거리만으로 판정 (기존 동작 보존)
        assert is_arrival(10.0, None) is True

    def test_fair_accuracy_boundary_passes(self):
        assert is_arrival(10.0, FAIR_ACCURACY_M) is True

    def test_poor_accuracy_suppressed(self):
        # 오차 큰 GPS의 조기 도착 오판 방지
        assert is_arrival(10.0, FAIR_ACCURACY_M + 1) is False

    def test_custom_radius(self):
        assert is_arrival(50.0, 10.0, radius_m=60.0) is True


class TestInRerouteWarmup:
    # 워밍업: 샘플 5개 미만 '그리고' 30초 미만일 때만 True
    def test_warmup_active_at_start(self):
        assert in_reroute_warmup(1, 3_000) is True

    def test_sample_count_ends_warmup(self):
        assert in_reroute_warmup(REROUTE_WARMUP_SAMPLES, 3_000) is False

    def test_elapsed_time_ends_warmup(self):
        assert in_reroute_warmup(2, REROUTE_WARMUP_MS) is False

    def test_boundary_just_below_both(self):
        assert in_reroute_warmup(REROUTE_WARMUP_SAMPLES - 1, REROUTE_WARMUP_MS - 1) is True
