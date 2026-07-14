# -*- coding: utf-8 -*-
"""snap_router — 진행도(along-track) 기반 무료 이탈 확정/거부 층 (외부 데이터·API 불필요).

왜 필요한가:
    엔진(engine.py)은 '경로선까지 횡거리'만으로 deviated 를 낸다. 도심 GPS는 20~30m 옆으로
    튀어 정상 보행 중에도 이탈로 오인 → 헛 재탐색. 엔진이 이미 계산한 '진행도(along)'를 쓰면
    'GPS 튐/정지'와 '진짜 이탈'을 상당 부분 구분할 수 있다.

⚠️ 원리적 한계(중요):
    '경로 옆으로 치우쳐 보이지만 계속 전진'하는 상태는 두 원인이 겹친다 —
    (a) GPS 지터/편향(실제로는 경로 위)  (b) 평행/얕은각 옆길(실제 이탈).
    along·offset 만으로는 (a)와 (b)를 구분할 수 없다(둘 다 offset≈일정·along 증가).
    → 이 경우 snap 은 스스로 확정하지 않고 ON_ROUTE_LIKELY(=애매)로 표시해 '뒷단(Mapbox 도로망)'에
      판단을 넘긴다. Mapbox 가 없으면(토큰 미설정) 사용자 우선순위(헛 재탐색 제거)에 따라 지터로
      간주해 거부하되, 그 대가로 '평행도로 실이탈'은 놓칠 수 있다(문서화된 절충 — 도로망 필요).

상태:
    STATIONARY          제자리 흔들림(순변위 작고 방향성 낮음)          → 무료 확정 거부(안전).
    ON_ROUTE_LIKELY     진행 중 + 코리도어 안(지터 or 평행, 구분불가)   → 뒷단(Mapbox) 위임.
    OFF_ROUTE_CONFIRMED 진행 정체·완만후퇴 + 큰 횡거리 + 실이동 + 양호   → 진짜 이탈(거부 안 함).
    DEFER               그 외/불충분/스냅점프                          → 뒷단 위임.

설계 원칙: 순수 함수(외부 데이터·네트워크·전역상태 없음). engine.py 코어 비침습. 거부는 이 층이
    '확실할 때만' 하고(정지), 애매·이탈은 뒷단/엔진에 맡겨 실제 이탈을 영구히 놓치지 않는다.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

# ── 상태 ──────────────────────────────────────────────────────────────────────
STATIONARY = "STATIONARY"
ON_ROUTE_LIKELY = "ON_ROUTE_LIKELY"
OFF_ROUTE_CONFIRMED = "OFF_ROUTE_CONFIRMED"
DEFER = "DEFER"

# ── 튜닝값 (설계서 §4 참고, 절대기준 아님) ───────────────────────────────────
MIN_WINDOW = 3               # 진행도·순변위 판정에 필요한 최소 표본 수.
STATIONARY_MIN_PATH_M = 3.0  # 이동경로 합이 이 이상일 때만 정지 방향성 판정(작은 윈도 노이즈 방지).
STATIONARY_RATIO = 0.6       # 순변위/이동경로 < 이 값이면 '제자리 흔들림'(방향성 낮음) → 정지.
                             # 지터는 방향성이 낮고(≈0.1~0.5) 실제 보행은 높다(≈0.8~1.0).
PROGRESS_ADVANCE_M = 4.0     # 진행도가 이만큼 이상 늘면 '경로 따라 진행 중'.
CORRIDOR_M = 40.0            # 진행 중 + 횡거리 이 미만 → ON_ROUTE_LIKELY(뒷단 위임). 이상이면 DEFER.
PROGRESS_STALL_M = 1.0       # 진행도 증가가 이 이하(정체/완만후퇴)면 이탈 후보.
OFF_ROUTE_OFFSET_M = 18.0    # 진행 정체 + 횡거리 이 이상이면 이탈 확정 후보.
MIN_REAL_MOVE_M = 4.0        # 이탈 확정은 실제 이동(순변위)이 이 이상일 때만(정지 오판 방지).
UNCERTAIN_ACC_M = 30.0       # 최신 GPS 정확도(반경)가 이보다 나쁘면 '이탈 확정'을 보류(하드 거부는 안 함).
JUMP_FACTOR = 2.0            # along 변화가 순변위×이 값 + 여유를 넘으면 세그먼트 스냅 점프(U자 등) → 보류.
JUMP_MARGIN_M = 8.0


@dataclass(frozen=True)
class SnapSample:
    """재탐색 판정용 최근 표본 한 점(엔진 metrics + 직전 표본 대비 실제 이동)."""
    along_m: float       # route_distance_along_meters (진행도)
    offset_m: float      # distance_from_route_meters (경로까지 횡거리, 부호 없음)
    ts_ms: int
    moved_m: float = 0.0  # 직전 표본으로부터 실제 이동거리(윈도 첫 점은 0)


def classify(
    window: Sequence[SnapSample],
    *,
    latest_accuracy_m: Optional[float] = None,
    net_move_m: Optional[float] = None,
) -> str:
    """최근 표본 윈도로 이탈 후보의 상태를 판정한다(위 상태 상수 중 하나).

    net_move_m: 윈도 시작↔끝 위치의 직선 거리(순변위). None 이면 이동경로 합으로 보수적 대체.
    """
    if len(window) < MIN_WINDOW:
        return DEFER

    along_delta = window[-1].along_m - window[0].along_m
    total_path = sum(s.moved_m for s in window[1:])
    latest_offset = window[-1].offset_m
    if net_move_m is None:
        net_move_m = total_path  # 대체값: 순변위를 과대평가 → 정지로 오판하지 않는 안전측
    bad_acc = latest_accuracy_m is not None and latest_accuracy_m > UNCERTAIN_ACC_M
    # 방향성: 순변위/이동경로. 0=제자리 흔들림(GPS 지터), 1=직선 이동. 지터 '크기'와 무관하게 견고.
    direction = net_move_m / total_path if total_path > 1e-6 else 1.0

    # 0) 세그먼트 스냅 점프(U자/왕복에서 전역 최근접 투영이 지나온 세그먼트로 튐):
    #    along 변화가 물리 이동을 크게 초과하면 진행도 신뢰 불가 → 보류(뒷단 판단).
    if abs(along_delta) > net_move_m * JUMP_FACTOR + JUMP_MARGIN_M:
        return DEFER

    # 1) 정지(신호대기 등 제자리 흔들림): 이동경로는 있으나 방향성이 낮다. 실제 이동(직선성 높음)은
    #    걸러진다. 순변위 절대값이 아닌 '방향성'으로 판정해 GPS 지터 크기·상류 1m 게이트와 무관하게 견고.
    if total_path >= STATIONARY_MIN_PATH_M and direction < STATIONARY_RATIO:
        return STATIONARY

    # 2) 경로 따라 진행 + 코리도어 안 → 지터 또는 평행/얕은각 옆길(구분 불가) → 뒷단(Mapbox) 위임.
    if along_delta >= PROGRESS_ADVANCE_M and latest_offset < CORRIDOR_M:
        return ON_ROUTE_LIKELY

    # 3) 진행 정체·완만후퇴 + 큰 횡거리 + 실제 이동 + 양호 정확도 → 진짜 이탈 확정.
    #    횡거리는 최신 1표본만이 아니라 직전 표본에서도 커야 한다 — 정지 중 방향성 드리프트/
    #    단발 스파이크가 마지막 표본만 크게 나올 때 오확정(제자리 헛 재탐색)되는 것을 막는다.
    if (
        PROGRESS_STALL_M >= along_delta >= -net_move_m
        and latest_offset >= OFF_ROUTE_OFFSET_M
        and window[-2].offset_m >= OFF_ROUTE_OFFSET_M * 0.7
        and net_move_m >= MIN_REAL_MOVE_M
        and not bad_acc
    ):
        return OFF_ROUTE_CONFIRMED

    # 4) 그 외(진행 중이나 횡거리 큼=평행도로 의심, 애매 진행도, 저신뢰 등) → 보류.
    return DEFER
