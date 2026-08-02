# -*- coding: utf-8 -*-
"""회전점 주변 랜드마크 후보 자동 수집 (반자동 ③안).

왜 자동 수집인가:
    안내 문구("CU편의점을 지나 왼쪽으로 도세요")는 승인된 랜드마크가 있어야 나온다.
    100~300개를 전부 손으로 등록하면 하루가 걸리고, 그 전까지는 "잠시 후 좌회전입니다"
    로만 안내된다. POI 검색으로 회전점 주변 후보를 미리 뽑아 두면 현장에서는 '보이는가'
    만 확인해 승인하면 된다.

왜 자동 승인이 아닌가:
    POI DB 는 좌표·이름·분류만 준다. 실제로 그 자리에서 보이는지(가시성), 어느 방향에서
    보이는지(visible_from_degrees), 오래 남을 간판인지(영속성)는 알 수 없다. 이 값들이
    선정 점수의 30% 를 차지하므로, 추정값으로 승인하면 '보이지도 않는 간판'을 기준으로
    안내하게 된다. 그래서 여기서 만든 후보는 항상 draft 이고, 출처(source)에 자동 수집
    표식을 남겨 landmarks.is_non_field_source 가 무단 승인을 막는다.

설계: 네트워크 호출은 주입받는다(search_nearby). 이 모듈 자체는 순수 함수라
     테스트에서 가짜 검색 함수로 전 분기를 고정할 수 있다.
"""

from __future__ import annotations

import hashlib
from typing import Callable, Iterable, Optional, Sequence

from engine import Coordinate, RouteModel, distance_meters
from engine import point_to_polyline_distance_meters
from landmarks import Landmark

# 자동 수집 출처 표식 — landmarks._NON_FIELD_SOURCE_MARKERS 와 짝을 이룬다.
AUTO_SOURCE = "poi_auto_needs_field_verification"

# 검색 키워드 → 랜드마크 분류. 보행 안내에 쓸 만한(눈에 띄고 오래 가는) 것만 둔다.
# 순서가 곧 우선순위 — 앞쪽 키워드가 같은 자리에서 먼저 잡힌다.
HARVEST_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("편의점", "convenience_store"),
    ("약국", "pharmacy"),
    ("카페", "cafe"),
    ("지하철역 출구", "station_exit"),
    ("은행", "large_sign"),
    ("주유소", "large_sign"),
)

# 회전점에서 이 거리 안에 있어야 후보 — landmarks.score_landmark_for_turn 의
# max_turn_distance_meters 와 같은 값(더 멀리 모아도 점수 단계에서 어차피 버려진다).
MAX_TURN_DISTANCE_M = 60.0
# 경로선에서 이 거리 안에 있어야 후보(길 건너 반대편·안쪽 건물 배제).
MAX_ROUTE_DISTANCE_M = 40.0
# 같은 자리로 볼 좌표 정밀도(약 11m) — 키워드가 달라도 중복 등록하지 않는다.
_DEDUPE_DECIMALS = 4

# 자동 수집분의 점수는 '모른다'는 뜻의 중립값. 현장 승인 때 사람이 올린다.
NEUTRAL_SCORE = 0.5

SearchNearby = Callable[[Coordinate, str, int], Sequence[tuple[Coordinate, str]]]


def _auto_id(name: str, coord: Coordinate) -> str:
    """이름+좌표로 안정적인 id — 다시 수집해도 같은 자리는 같은 id 로 덮어쓴다."""
    key = f"{name}|{coord.latitude:.{_DEDUPE_DECIMALS}f}|{coord.longitude:.{_DEDUPE_DECIMALS}f}"
    return "auto-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


def _dedupe_key(name: str, coord: Coordinate) -> tuple[str, float, float]:
    return (
        name.strip(),
        round(coord.latitude, _DEDUPE_DECIMALS),
        round(coord.longitude, _DEDUPE_DECIMALS),
    )


def _short_name(display: str) -> str:
    """'서울 중구 태평로 CU시청점' → 'CU시청점'. 주소 접두어를 떼 안내 문장을 짧게."""
    parts = [p for p in str(display or "").split() if p]
    return parts[-1] if parts else str(display or "").strip()


def harvest_candidates(
    route: RouteModel,
    search_nearby: SearchNearby,
    *,
    keywords: Iterable[tuple[str, str]] = HARVEST_KEYWORDS,
    per_keyword: int = 3,
    max_turn_distance_m: float = MAX_TURN_DISTANCE_M,
    max_route_distance_m: float = MAX_ROUTE_DISTANCE_M,
    existing_ids: Optional[Iterable[str]] = None,
) -> list[Landmark]:
    """경로의 각 회전점 주변에서 랜드마크 후보를 모아 draft 로 만든다.

    - 회전점에서 max_turn_distance_m, 경로선에서 max_route_distance_m 안쪽만 남긴다.
    - 같은 자리(약 11m 격자·같은 이름)는 한 번만 만든다.
    - existing_ids 에 있는 id 는 건너뛴다(이미 등록·검수한 것을 draft 로 되돌리지 않기 위함).
    - 검색 실패(예외)는 그 키워드만 건너뛴다 — 한 번의 네트워크 오류로 수집 전체가
      빈손이 되지 않게 한다.
    """
    known = set(existing_ids or ())
    seen: set[tuple[str, float, float]] = set()
    found: list[Landmark] = []

    for turn_point in sorted(route.turn_points, key=lambda item: item.route_index):
        if turn_point.direction not in ("left", "right"):
            continue  # 직진 지점에는 기준점이 필요 없다
        for keyword, category in keywords:
            try:
                results = search_nearby(turn_point.coordinate, keyword, per_keyword)
            except Exception:  # noqa: BLE001 — 수집은 부가 기능, 실패해도 나머지를 계속
                continue
            for coord, display in results or ():
                if distance_meters(coord, turn_point.coordinate) > max_turn_distance_m:
                    continue
                route_distance, _, _ = point_to_polyline_distance_meters(
                    coord, route.polyline
                )
                if route_distance > max_route_distance_m:
                    continue
                name = _short_name(display)
                if not name:
                    continue
                key = _dedupe_key(name, coord)
                if key in seen:
                    continue
                seen.add(key)
                landmark_id = _auto_id(name, coord)
                if landmark_id in known:
                    continue
                found.append(Landmark(
                    id=landmark_id,
                    name=name,
                    category=category,
                    coordinate=coord,
                    entrance_description="",
                    photo_url="",
                    photo_alt="",
                    visible_from_degrees=(),      # 현장에서 채운다
                    visibility_score=NEUTRAL_SCORE,
                    permanence_score=NEUTRAL_SCORE,
                    distinctiveness_score=NEUTRAL_SCORE,
                    accessibility_tags=(),
                    source=AUTO_SOURCE,
                    verified_at="",
                    status="draft",
                    condition_notes=f"POI 자동 수집({keyword}) — 현장에서 가시성·방향 확인 필요",
                ))
    return found
