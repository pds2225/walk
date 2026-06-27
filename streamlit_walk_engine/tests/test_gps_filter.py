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
    USABLE_ACCURACY_M,
    WEAK_TOAST_COOLDOWN_MS,
    ARRIVAL_RADIUS_M,
    REROUTE_WARMUP_SAMPLES,
    REROUTE_WARMUP_MS,
    JUMP_REJECT_STREAK_ESCAPE,
    JUMP_ELAPSED_ESCAPE_MS,
    WALK_SPEED_DEFAULT,
    accuracy_quality,
    alert_level,
    decide_alert,
    is_fix_usable,
    is_arrival,
    in_reroute_warmup,
    is_plausible_step,
    sanitize_motion,
)


class TestConstants:
    def test_constant_values(self):
        assert GOOD_ACCURACY_M == 15.0
        assert FAIR_ACCURACY_M == 35.0
        assert ALERT_ACCURACY_GATE_M == 15.0
        assert USABLE_ACCURACY_M == 50.0
        assert WEAK_TOAST_COOLDOWN_MS == 15_000


class TestIsFixUsable:
    # accuracy 미보고(None) → 기존 동작 보존 = 사용
    def test_none_is_usable(self):
        assert is_fix_usable(None) is True

    # 50m 이내(경계 포함 ≤) → 사용
    def test_within_limit_is_usable(self):
        assert is_fix_usable(10) is True

    def test_at_boundary_is_usable(self):
        assert is_fix_usable(50.0) is True

    # 50m 초과 → 무시
    def test_over_limit_is_unusable(self):
        assert is_fix_usable(50.1) is False
        assert is_fix_usable(120) is False

    # 커스텀 한계
    def test_custom_limit(self):
        assert is_fix_usable(30, max_accuracy_m=25.0) is False
        assert is_fix_usable(20, max_accuracy_m=25.0) is True


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


class TestIsPlausibleStep:
    # 서울시청 근방 기준점 (위도 1도 ≈ 111km)
    P_LAT, P_LON = 37.5665, 126.9780

    def test_normal_walk_step_is_plausible(self):
        # 약 10m 이동, 3초, accuracy 20+20 → 허용 내(allowed≈59m)
        assert is_plausible_step(
            self.P_LAT, self.P_LON, self.P_LAT + 0.00009, self.P_LON,
            elapsed_ms=3000, new_accuracy_m=20, prev_accuracy_m=20,
        ) is True

    def test_teleport_is_rejected(self):
        # 약 150m 점프, 3초, accuracy 5+5 → 기각(allowed≈29m)
        assert is_plausible_step(
            self.P_LAT, self.P_LON, self.P_LAT + 0.00135, self.P_LON,
            elapsed_ms=3000, new_accuracy_m=5, prev_accuracy_m=5,
        ) is False

    def test_zero_elapsed_is_clamped(self):
        # elapsed 0(비단조/동일 timestamp)도 min_elapsed로 클램프 → 작은 이동 통과
        assert is_plausible_step(
            self.P_LAT, self.P_LON, self.P_LAT + 0.00003, self.P_LON,
            elapsed_ms=0, new_accuracy_m=None, prev_accuracy_m=None,
        ) is True

    def test_accuracy_none_treated_as_zero(self):
        # accuracy None은 0으로 처리(마진 없음) — base_margin으로 작은 이동 통과
        assert is_plausible_step(
            self.P_LAT, self.P_LON, self.P_LAT + 0.00005, self.P_LON,
            elapsed_ms=3000, new_accuracy_m=None, prev_accuracy_m=None,
        ) is True

    def test_same_point_is_plausible(self):
        assert is_plausible_step(
            self.P_LAT, self.P_LON, self.P_LAT, self.P_LON,
            elapsed_ms=3000, new_accuracy_m=10, prev_accuracy_m=10,
        ) is True

    def test_reject_streak_escape_accepts_jump(self):
        # 연속 기각 누적 시 텔레포트여도 강제 수용(고착 방지)
        assert is_plausible_step(
            self.P_LAT, self.P_LON, self.P_LAT + 0.01, self.P_LON,
            elapsed_ms=3000, new_accuracy_m=5, prev_accuracy_m=5,
            reject_streak=JUMP_REJECT_STREAK_ESCAPE,
        ) is True

    def test_large_elapsed_escape_accepts_jump(self):
        # 오래 멈춘 뒤 복귀 — 큰 경과면 큰 이동도 수용
        assert is_plausible_step(
            self.P_LAT, self.P_LON, self.P_LAT + 0.01, self.P_LON,
            elapsed_ms=JUMP_ELAPSED_ESCAPE_MS, new_accuracy_m=5, prev_accuracy_m=5,
        ) is True


class TestSanitizeMotion:
    def test_trusts_normal_gps(self):
        assert sanitize_motion(90.0, 1.2, None, None) == (90.0, 1.2)

    def test_low_speed_gps_falls_back_to_derived(self):
        # GPS speed 0.1(<0.5) → heading 노이즈 불신, 파생값 사용
        assert sanitize_motion(270.0, 0.1, 45.0, 1.0) == (45.0, 1.0)

    def test_overspeed_gps_falls_back_to_derived(self):
        # GPS speed 10(>7) → 신뢰 윈도우 밖, 파생값 사용
        assert sanitize_motion(270.0, 10.0, 30.0, 2.0) == (30.0, 2.0)

    def test_no_gps_uses_derived_with_speed_clamp(self):
        # 파생 speed가 비현실적이면 보행 상한(3.0)으로 클램프
        assert sanitize_motion(None, None, 80.0, 20.0) == (80.0, 3.0)

    def test_nothing_usable_returns_default(self):
        assert sanitize_motion(None, None, None, None) == (0.0, WALK_SPEED_DEFAULT)

    def test_gps_speed_lower_boundary_trusted(self):
        assert sanitize_motion(120.0, 0.5, None, None) == (120.0, 0.5)

    def test_gps_speed_upper_boundary_trusted_and_clamped(self):
        # 경계 7.0 → 신뢰하되 speed는 3.0 클램프
        assert sanitize_motion(120.0, 7.0, None, None) == (120.0, 3.0)

    def test_overspeed_gps_no_derived_returns_default(self):
        assert sanitize_motion(270.0, 10.0, None, None) == (0.0, WALK_SPEED_DEFAULT)
