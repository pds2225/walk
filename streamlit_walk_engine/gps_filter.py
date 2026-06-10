"""GPS accuracy 기반 알림 게이팅 순수 함수 모듈 (엔진 코어 비침습).

도심 GPS 오차(10~50m)가 이탈 임계값(10/15m)보다 커서 발생하는 오탐 알림을
accuracy 기반 3단계(full/weak/mute)로 게이팅한다. engine.py는 수정하지 않으며,
모든 함수는 부수효과 없는 순수 함수다.

동작 변경 주의: accuracy가 게이트보다 나쁜(poor) 구간에서는 미확정 상태
(``drifting``)를 mute로 처리한다. 즉 기존에 울리던 '이탈 시작' 알림이 이 구간에서는
울리지 않는다 — heading 노이즈로 들어온 미확정 drift를 weak로 올리면 오탐이
재증가하므로 의도된 결정이며, 진짜 이탈이면 ``deviated`` 승격 시 weak가 발화한다.
"""

from __future__ import annotations

from typing import Literal, NamedTuple, Optional

from engine import DeviationState  # 읽기 전용 import (코어 수정 없음)

AccuracyQuality = Literal["good", "fair", "poor", "unknown"]
AlertLevel = Literal["full", "weak", "mute"]

# 배지 경계(표시용): good ≤ 15m < fair ≤ 35m < poor
GOOD_ACCURACY_M = 15.0
FAIR_ACCURACY_M = 35.0
# 알림 억제 시작 실효 경계 — UI 슬라이더와 분리된 독립 상수
ALERT_ACCURACY_GATE_M = 15.0
# weak toast 재발화 쿨다운
WEAK_TOAST_COOLDOWN_MS = 15_000

# 확정 이탈로 간주하는 엔진 상태 (engine.DeviationState 부분집합)
_CONFIRMED_DEVIATION_STATES = ("deviated", "passed_turn")

# 도착 판정 반경 — 이 거리 이내 + accuracy 신뢰 가능 시 도착 처리
ARRIVAL_RADIUS_M = 20.0
# 재경로 워밍업 가드 — 경로 시작 직후 GPS 안정화 전 오탐 재경로 방지
REROUTE_WARMUP_SAMPLES = 5
REROUTE_WARMUP_MS = 30_000


class AlertDecision(NamedTuple):
    """decide_alert의 결정 결과. 호출부는 이 값으로 발화·세션 상태 갱신을 수행한다."""

    fire_full: bool
    fire_weak_toast: bool
    new_last_alerted: str
    new_last_weak_ts_ms: Optional[int]


def accuracy_quality(accuracy_m: Optional[float]) -> AccuracyQuality:
    """GPS accuracy(m)를 배지용 품질 등급으로 분류한다 (경계 포함 ≤)."""
    if accuracy_m is None:
        return "unknown"
    if accuracy_m <= GOOD_ACCURACY_M:
        return "good"
    if accuracy_m <= FAIR_ACCURACY_M:
        return "fair"
    return "poor"


def is_arrival(
    distance_to_dest_m: float,
    accuracy_m: Optional[float],
    radius_m: float = ARRIVAL_RADIUS_M,
) -> bool:
    """목적지 도착 판정 — 반경 이내이면서 accuracy가 fair(≤35m) 이하일 때만 True.

    - accuracy 미보고(None, 수동 입력) → 기존 동작 보존 차원에서 거리만으로 판정.
    - poor accuracy(>35m)에서 억제하는 이유: 오차 큰 GPS가 우연히 반경에
      들어와 조기 도착 처리되는 오판 방지 (보수적 판정).
    """
    if distance_to_dest_m > radius_m:
        return False
    return accuracy_m is None or accuracy_m <= FAIR_ACCURACY_M


def in_reroute_warmup(sample_count: int, elapsed_since_start_ms: int) -> bool:
    """경로 시작 직후 재경로 금지 구간 여부.

    샘플 5개 미만 + 경과 30초 미만이 모두 해당될 때만 True (둘 중 하나라도
    충족되면 워밍업 종료). 시작 직후 GPS 워밍업 노이즈로 deviated가 떠서
    곧바로 재경로가 발동하는 오탐을 막는다.
    """
    return (
        sample_count < REROUTE_WARMUP_SAMPLES
        and elapsed_since_start_ms < REROUTE_WARMUP_MS
    )


def alert_level(
    accuracy_m: Optional[float],
    engine_state: DeviationState,
    accuracy_gate_m: float = ALERT_ACCURACY_GATE_M,
) -> AlertLevel:
    """accuracy와 엔진 상태로 알림 강도(full/weak/mute)를 결정한다.

    - accuracy 미보고(None, 수동 입력 등) → "full" (기존 동작 보존).
    - accuracy ≤ gate(양호) → "full".
    - accuracy > gate(나쁨) + 확정 이탈(deviated/passed_turn) → "weak".
    - accuracy > gate(나쁨) + on_route/drifting → "mute".
      (drifting을 mute로 두는 것은 의도된 결정 — 모듈 docstring 참조.)
    """
    if accuracy_m is None:
        return "full"
    if accuracy_m <= accuracy_gate_m:
        return "full"
    if engine_state in _CONFIRMED_DEVIATION_STATES:
        return "weak"
    return "mute"


def decide_alert(
    state: DeviationState,
    last_alerted: DeviationState,
    level: AlertLevel,
    now_ms: int,
    last_weak_ts_ms: Optional[int],
    alert_enabled: bool,
    cooldown_ms: int = WEAK_TOAST_COOLDOWN_MS,
) -> AlertDecision:
    """상태 전이 게이트(state != last_alerted)까지 포함한 최종 발화 결정.

    - alert_enabled=False → 최우선 미발화, last_alerted/ts 미갱신
      (전이를 '소비'하지 않아 재활성화 시 정상 발화).
    - 전이 없음(state == last_alerted) → 미발화, 전부 불변.
    - full + 전이 → fire_full, last_alerted 갱신.
    - weak + 전이 + 쿨다운 경과(또는 첫 발화) → fire_weak_toast, last_alerted·ts 갱신.
    - weak + 전이 + 쿨다운 미경과 → 미발화, last_alerted만 갱신(동일 state 재토글 방지).
    - mute → 미발화, last_alerted 미갱신(안전 측 기본값: 정확도 회복 시 같은
      state로도 full이 재발화될 수 있게), ts 불변.
    """
    if not alert_enabled:
        return AlertDecision(
            fire_full=False,
            fire_weak_toast=False,
            new_last_alerted=last_alerted,
            new_last_weak_ts_ms=last_weak_ts_ms,
        )

    if state == last_alerted:
        return AlertDecision(
            fire_full=False,
            fire_weak_toast=False,
            new_last_alerted=last_alerted,
            new_last_weak_ts_ms=last_weak_ts_ms,
        )

    if level == "full":
        return AlertDecision(
            fire_full=True,
            fire_weak_toast=False,
            new_last_alerted=state,
            new_last_weak_ts_ms=last_weak_ts_ms,
        )

    if level == "weak":
        cooldown_elapsed = (
            last_weak_ts_ms is None or now_ms - last_weak_ts_ms > cooldown_ms
        )
        if cooldown_elapsed:
            return AlertDecision(
                fire_full=False,
                fire_weak_toast=True,
                new_last_alerted=state,
                new_last_weak_ts_ms=now_ms,
            )
        return AlertDecision(
            fire_full=False,
            fire_weak_toast=False,
            new_last_alerted=state,
            new_last_weak_ts_ms=last_weak_ts_ms,
        )

    # level == "mute": last_alerted 미갱신 — 정확도 회복 시 full 재발화 허용
    return AlertDecision(
        fire_full=False,
        fire_weak_toast=False,
        new_last_alerted=last_alerted,
        new_last_weak_ts_ms=last_weak_ts_ms,
    )
