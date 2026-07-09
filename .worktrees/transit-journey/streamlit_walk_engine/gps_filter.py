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

from engine import Coordinate, DeviationState, distance_meters  # 읽기 전용 import (코어 수정 없음)

AccuracyQuality = Literal["good", "fair", "poor", "unknown"]
AlertLevel = Literal["full", "weak", "mute"]

# 배지 경계(표시용): good ≤ 15m < fair ≤ 35m < poor
GOOD_ACCURACY_M = 15.0
FAIR_ACCURACY_M = 35.0
# 알림 억제 시작 실효 경계 — UI 슬라이더와 분리된 독립 상수
ALERT_ACCURACY_GATE_M = 15.0
# 위치 갱신 사용 한계 — 이보다 나쁜(큰) accuracy의 fix는 현재 위치 갱신에 쓰지 않는다.
# 도심 GPS 오차 상단(~50m)을 넘는 측정은 "현재 위치"로 신뢰하지 않고 이전 위치를 유지한다.
USABLE_ACCURACY_M = 50.0
# weak toast 재발화 쿨다운
WEAK_TOAST_COOLDOWN_MS = 15_000

# 확정 이탈로 간주하는 엔진 상태 (engine.DeviationState 부분집합)
_CONFIRMED_DEVIATION_STATES = ("deviated", "passed_turn")

# 도착 판정 반경 — 이 거리 이내 + accuracy 신뢰 가능 시 도착 처리
ARRIVAL_RADIUS_M = 20.0
# 재경로 워밍업 가드 — 경로 시작 직후 GPS 안정화 전 오탐 재경로 방지
REROUTE_WARMUP_SAMPLES = 5
REROUTE_WARMUP_MS = 30_000

# ── GPS 위치 보정(점프 제거·모션 신뢰) 파라미터 ──────────────────────────────
# 보행 이동 상한(m/s) — 빠른 걸음/가벼운 조깅 포함 여유값. 한 틱에 이를 크게
# 초과한 이동은 GPS 점프(텔레포트)로 보고 '현재 위치' 갱신에서 제외한다.
WALK_MAX_SPEED_MPS = 3.0
JUMP_MIN_ELAPSED_S = 1.0          # 경과시간 과소추정(0·비단조 timestamp) 방지 하한
JUMP_BASE_MARGIN_M = 10.0         # 측위 흔들림 기본 허용 마진
JUMP_REJECT_STREAK_ESCAPE = 3     # 연속 기각이 이만큼 쌓이면 강제 수용(고착 방지)
JUMP_ELAPSED_ESCAPE_MS = 60_000   # 이 이상 경과하면 강제 수용(오래 멈춘 뒤 복귀)
# 모션(heading/speed) 신뢰 윈도우
MOTION_MIN_TRUST_SPEED = 0.5          # 이 미만 GPS speed의 heading은 노이즈로 보고 불신
MOTION_HEADING_TRUST_MAX_SPEED = 7.0  # 이 초과 GPS speed는 heading 신뢰 윈도우 밖
WALK_SPEED_DEFAULT = 1.4              # 정보 없을 때 가정 보행 속도(m/s)
MOTION_SPEED_CLAMP_MAX = 3.0          # 최종 speed 상한(엔진 판정 미사용·일관성용)


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


def is_fix_usable(
    accuracy_m: Optional[float],
    max_accuracy_m: float = USABLE_ACCURACY_M,
) -> bool:
    """GPS fix를 '현재 위치' 갱신에 쓸지 결정한다 (±max_accuracy_m 이내만 신뢰).

    - accuracy 미보고(None: 수동 입력·미지원 브라우저 등) → True (기존 동작 보존).
    - accuracy ≤ max(양호) → True.
    - accuracy > max(나쁨) → False (이 fix는 무시하고 이전 위치 유지).
    """
    if accuracy_m is None:
        return True
    return accuracy_m <= max_accuracy_m


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


def is_plausible_step(
    prev_lat: float,
    prev_lon: float,
    new_lat: float,
    new_lon: float,
    elapsed_ms: float,
    new_accuracy_m: Optional[float],
    prev_accuracy_m: Optional[float],
    reject_streak: int = 0,
    max_speed_mps: float = WALK_MAX_SPEED_MPS,
    min_elapsed_s: float = JUMP_MIN_ELAPSED_S,
    base_margin_m: float = JUMP_BASE_MARGIN_M,
    escape_streak: int = JUMP_REJECT_STREAK_ESCAPE,
    escape_elapsed_ms: float = JUMP_ELAPSED_ESCAPE_MS,
) -> bool:
    """직전 위치 대비 새 fix의 이동거리가 현실적인지(점프 아님) 판정한다.

    허용 이동거리 = max_speed_mps * max(elapsed_s, min_elapsed_s)
                    + (new_acc or 0) + (prev_acc or 0) + base_margin_m.
    이를 초과하면 GPS 점프로 보고 False(위치 갱신 제외) — 도심 멀티패스로
    위치가 수십~수백 m 튀어 생기는 이탈 오탐·헛재경로를 막는다.

    고착(starvation) 방지: 연속 기각(reject_streak)이 escape_streak 이상이거나
    경과(elapsed_ms)가 escape_elapsed_ms 이상이면 무조건 True(수용)를 반환해,
    실제로 멀리 이동했는데 낡은 앵커에 갇히는 상황을 푼다.
    첫 fix(호출부에서 prev 없음) 처리는 호출부 책임이다.
    """
    if reject_streak >= escape_streak:
        return True
    if elapsed_ms >= escape_elapsed_ms:
        return True
    elapsed_s = max(elapsed_ms / 1000.0, min_elapsed_s)
    moved = distance_meters(
        Coordinate(latitude=prev_lat, longitude=prev_lon),
        Coordinate(latitude=new_lat, longitude=new_lon),
    )
    allowed = (
        max_speed_mps * elapsed_s
        + (new_accuracy_m or 0.0)
        + (prev_accuracy_m or 0.0)
        + base_margin_m
    )
    return moved <= allowed


def sanitize_motion(
    gps_heading: Optional[float],
    gps_speed: Optional[float],
    derived_heading: Optional[float],
    derived_speed: Optional[float],
    walk_speed_default: float = WALK_SPEED_DEFAULT,
    min_trust_speed: float = MOTION_MIN_TRUST_SPEED,
    heading_trust_max_speed: float = MOTION_HEADING_TRUST_MAX_SPEED,
    speed_clamp_max: float = MOTION_SPEED_CLAMP_MAX,
) -> tuple[float, float]:
    """보행에 맞는 (heading, speed)를 고른다.

    - GPS speed가 신뢰 윈도우[min_trust_speed, heading_trust_max_speed] 안이면
      GPS heading/speed 사용(저속 heading 노이즈·극단 과속 배제).
    - 아니면 파생값(직전 좌표 기반)을 사용.
    - 둘 다 없으면 (0.0, walk_speed_default) — 기존 fallback과 동일.
    최종 speed는 [0, speed_clamp_max]로 보행 상한 클램프.
    speed는 엔진 이탈/회전 판정에 쓰이지 않으므로(보고용) 클램프가 판정에 영향 없음.
    """
    if (
        gps_heading is not None
        and gps_speed is not None
        and min_trust_speed <= float(gps_speed) <= heading_trust_max_speed
    ):
        heading = float(gps_heading)
        speed = float(gps_speed)
    elif derived_heading is not None and derived_speed is not None:
        heading = float(derived_heading)
        speed = float(derived_speed)
    else:
        heading = 0.0
        speed = walk_speed_default
    speed = min(max(speed, 0.0), speed_clamp_max)
    return heading, speed


# ── 위치 스무딩(떨림 억제·정지 안정) 파라미터 ──────────────────────────────
# 주의: SMOOTH_SKIP_MOVE_M(8m)은 이탈 시작 임계(기본 drift 10m)보다 작게 유지한다 —
# blend 정상상태 lag가 이탈 임계에 못 미쳐 정당한 deviated 감지를 지연시키지 않도록.
# 이탈 임계를 8m 이하로 낮추면 이 값도 함께 낮춰야 한다.
SMOOTH_RECENT_WINDOW = 5          # 정지 median 계산용 최근 fix 버퍼 길이
SMOOTH_SKIP_MOVE_M = 8.0          # 이 이상 이동하면 스무딩 생략(코너링·급이동 지연 방지)
SMOOTH_STATIONARY_MOVE_M = 2.0    # 이 미만 이동이면 정지로 보고 median 사용
SMOOTH_MEDIAN_MIN_FIXES = 3       # median에 필요한 최소 fix 수


def accuracy_weighted_blend(
    prev_lat: float,
    prev_lon: float,
    prev_accuracy_m: Optional[float],
    new_lat: float,
    new_lon: float,
    new_accuracy_m: Optional[float],
) -> tuple[float, float]:
    """직전 위치와 새 fix를 accuracy 가중으로 섞어 떨림(jitter)을 줄인다.

    더 정확한(accuracy가 작은) 쪽에 더 큰 비중. 새 fix 가중치
    w_new = prev_acc / (prev_acc + new_acc). prev/new accuracy 중 하나라도
    None이거나 합이 0이면 새 fix를 그대로 반환(보존).
    반환은 (lat, lon)만 — accuracy/raw_gps는 호출부가 raw로 유지(게이팅 일관성).
    """
    if prev_accuracy_m is None or new_accuracy_m is None:
        return new_lat, new_lon
    total = prev_accuracy_m + new_accuracy_m
    if total <= 0:
        return new_lat, new_lon
    w_new = prev_accuracy_m / total
    w_prev = 1.0 - w_new
    return (
        prev_lat * w_prev + new_lat * w_new,
        prev_lon * w_prev + new_lon * w_new,
    )


def median_position(points: list[tuple[float, float]]) -> tuple[float, float]:
    """좌표 목록의 축별 중앙값 위치(이상치에 강한 대표점)를 반환한다.

    각 축(lat, lon)을 독립 정렬해 median을 취한다(짝수면 중앙 2개 평균).
    정지 상태에서 단발 이상치 fix가 핀을 흔드는 것을 억제한다.
    빈 목록은 호출 금지(ValueError) — 호출부가 길이를 보장한다.
    """
    if not points:
        raise ValueError("median_position: empty points")

    def _median(vals: list[float]) -> float:
        s = sorted(vals)
        n = len(s)
        mid = n // 2
        if n % 2 == 1:
            return s[mid]
        return (s[mid - 1] + s[mid]) / 2.0

    return _median([p[0] for p in points]), _median([p[1] for p in points])
