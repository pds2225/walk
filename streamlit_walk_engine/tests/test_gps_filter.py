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
    STATIONARY_NET_MOVE_MAX_M,
    WALK_SPEED_DEFAULT,
    accuracy_quality,
    alert_level,
    announce_distance_m,
    decide_alert,
    is_fix_usable,
    is_arrival,
    in_reroute_warmup,
    is_plausible_step,
    is_stationary,
    sanitize_motion,
    accuracy_weighted_blend,
    median_position,
    should_skip_duplicate_fix,
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


class TestAccuracyWeightedBlend:
    def test_equal_accuracy_midpoint(self):
        assert accuracy_weighted_blend(0.0, 0.0, 10.0, 10.0, 10.0, 10.0) == (5.0, 5.0)

    def test_new_more_accurate_biases_to_new(self):
        # new(acc 1) ≪ prev(acc 100) → 결과가 new(10,10) 쪽으로 강하게 치우침
        lat, lon = accuracy_weighted_blend(0.0, 0.0, 100.0, 10.0, 10.0, 1.0)
        assert lat > 9.0 and lon > 9.0

    def test_prev_acc_none_returns_new(self):
        assert accuracy_weighted_blend(0.0, 0.0, None, 7.0, 8.0, 5.0) == (7.0, 8.0)

    def test_new_acc_none_returns_new(self):
        assert accuracy_weighted_blend(0.0, 0.0, 5.0, 7.0, 8.0, None) == (7.0, 8.0)

    def test_zero_total_returns_new(self):
        assert accuracy_weighted_blend(0.0, 0.0, 0.0, 7.0, 8.0, 0.0) == (7.0, 8.0)

    def test_same_point_returns_same(self):
        assert accuracy_weighted_blend(3.0, 4.0, 10.0, 3.0, 4.0, 10.0) == (3.0, 4.0)


class TestMedianPosition:
    def test_odd_count(self):
        assert median_position([(1.0, 1.0), (2.0, 2.0), (3.0, 3.0)]) == (2.0, 2.0)

    def test_even_count_averages_middle(self):
        assert median_position([(1.0, 1.0), (3.0, 3.0)]) == (2.0, 2.0)

    def test_outlier_resilience(self):
        # 근접 2개 + 멀리 1개 → median이 근접쪽(이상치 무시)
        lat, lon = median_position([(1.0, 1.0), (1.1, 1.1), (5.0, 5.0)])
        assert lat == 1.1 and lon == 1.1

    def test_single_point(self):
        assert median_position([(2.5, 3.5)]) == (2.5, 3.5)

    def test_empty_raises(self):
        import pytest
        with pytest.raises(ValueError):
            median_position([])


class TestShouldSkipDuplicateFix:
    """P1-1: maximumAge 캐시가 돌려준 '같은' fix(timestamp 동일)는 틱 전체 skip."""

    def test_same_timestamp_skips(self):
        assert should_skip_duplicate_fix(1_000, 1_000) is True

    def test_different_timestamp_processes(self):
        assert should_skip_duplicate_fix(1_000, 999) is False
        assert should_skip_duplicate_fix(999, 1_000) is False

    # timestamp 미보고(수동 입력 등) → 정상 처리를 막지 않는다
    def test_none_new_ts_processes(self):
        assert should_skip_duplicate_fix(None, 1_000) is False

    def test_none_prev_ts_processes(self):
        assert should_skip_duplicate_fix(1_000, None) is False

    def test_both_none_processes(self):
        assert should_skip_duplicate_fix(None, None) is False


class TestIsStationary:
    """P1-2: 정지 판정은 per-tick 이동량이 아니라 버퍼 '순변위'(첫↔끝)로.

    1초 폴링·시속 4km 보행은 틱당 ~1.1m로 정지 지터(1~2m)와 per-tick 구분 불가 —
    5틱 순변위는 보행 ~5.5m vs 정지 수십cm로 확실히 갈린다.
    """

    LAT = 37.5665
    LON = 126.9780
    M_PER_DEG_LAT = 111_320.0  # 위도 1도 ≈ 111.32km (미터→도 변환용)

    def _pt(self, north_m: float) -> tuple:
        return (self.LAT + north_m / self.M_PER_DEG_LAT, self.LON)

    def test_walking_net_displacement_is_not_stationary(self):
        # 5틱 × 1.1m/틱 = 순변위 4.4m > 2.5m → 보행(정지 아님)
        recent = [self._pt(i * 1.1) for i in range(5)]
        assert is_stationary(recent) is False

    def test_jitter_around_same_spot_is_stationary(self):
        # 지터가 있어도 첫↔끝 순변위가 작으면 정지 (중간점 이동은 무관)
        recent = [self._pt(0.0), self._pt(1.5), self._pt(-1.0), self._pt(0.3)]
        assert is_stationary(recent) is True

    def test_below_min_fixes_is_not_stationary(self):
        # 근거 부족(len < 3) → 같은 자리여도 정지로 단정하지 않는다
        assert is_stationary([self._pt(0.0), self._pt(0.1)]) is False

    def test_exactly_min_fixes_same_spot_is_stationary(self):
        assert is_stationary([self._pt(0.0)] * 3) is True

    def test_net_move_above_threshold_is_not_stationary(self):
        recent = [self._pt(0.0), self._pt(1.0), self._pt(3.0)]  # 순변위 3.0m > 2.5m
        assert is_stationary(recent) is False

    def test_net_move_below_threshold_is_stationary(self):
        recent = [self._pt(0.0), self._pt(0.5), self._pt(1.0)]  # 순변위 1.0m < 2.5m
        assert is_stationary(recent) is True

    def test_custom_threshold(self):
        recent = [self._pt(0.0), self._pt(1.0), self._pt(2.0)]  # 순변위 2.0m
        assert is_stationary(recent, net_move_max_m=1.5) is False
        assert is_stationary(recent, net_move_max_m=3.0) is True

    def test_default_threshold_constant(self):
        assert STATIONARY_NET_MOVE_MAX_M == 2.5


class TestAnnounceDistanceM:
    """P1-4: 회전 예고 거리 accuracy 보정 — GOOD 10m / FAIR 선형 증가 / POOR 20m 상한."""

    def test_none_accuracy_uses_base(self):
        assert announce_distance_m(None) == 10.0

    def test_good_accuracy_uses_base(self):
        assert announce_distance_m(5.0) == 10.0
        assert announce_distance_m(GOOD_ACCURACY_M) == 10.0  # 경계 포함 ≤15

    def test_fair_accuracy_scales_linearly(self):
        assert announce_distance_m(25.0) == 15.0   # 10 + (25-15)*0.5
        assert announce_distance_m(20.0) == 12.5

    def test_fair_upper_boundary_is_continuous(self):
        # 35m에서 10+min(10,10)=20 — poor 고정값 20과 연속(불연속 점프 없음)
        assert announce_distance_m(FAIR_ACCURACY_M) == 20.0

    def test_poor_accuracy_is_capped(self):
        assert announce_distance_m(36.0) == 20.0
        assert announce_distance_m(120.0) == 20.0  # 아무리 나빠도 상한 고정

    def test_custom_base(self):
        assert announce_distance_m(None, base_m=12.0) == 12.0
        assert announce_distance_m(25.0, base_m=12.0) == 17.0


# ── smooth_heading: 진행 방향 원형 평균 보정 ──────────────────────────────────
from gps_filter import smooth_heading, HEADING_SMOOTH_WINDOW  # noqa: E402


class TestSmoothHeading:
    def test_empty_and_all_none_return_none(self):
        assert smooth_heading([]) is None
        assert smooth_heading([None, None]) is None
        assert smooth_heading(None) is None

    def test_single_value_passthrough(self):
        assert smooth_heading([137.0]) == 137.0

    def test_wraps_around_north(self):
        # 350°와 10° 의 평균은 0° 근처여야 한다(산술평균 180° 는 오답).
        out = smooth_heading([350.0, 10.0])
        assert out < 30.0 or out > 330.0

    def test_ignores_none_entries(self):
        assert smooth_heading([None, 90.0, None]) == 90.0

    def test_recent_weighted(self):
        # 최근값(90°)에 더 가깝게 — 선형 가중이라 단순 평균(36°)보다 크다.
        out = smooth_heading([0.0, 0.0, 0.0, 90.0, 90.0])
        assert out > 45.0

    def test_window_limits_history(self):
        # window 밖의 오래된 값은 무시된다 — 최근 window 개만 반영.
        vals = [0.0] * 10 + [180.0] * HEADING_SMOOTH_WINDOW
        assert abs(smooth_heading(vals) - 180.0) < 1e-6

    def test_output_normalized_range(self):
        for out in (smooth_heading([359.0, 1.0]), smooth_heading([270.0, 350.0])):
            assert 0.0 <= out < 360.0
