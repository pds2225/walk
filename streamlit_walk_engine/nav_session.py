"""안내 세션 자동 재개(폰 잠금·새로고침 복귀) 판정 순수 함수 모듈.

Navigation 페이지(1_Navigation.py)의 복원/재개 결정 로직 중 부수효과 없는 부분을
분리해 단위 테스트로 각 분기를 고정한다. Streamlit·네트워크에 의존하지 않으며,
UI 는 이 함수들의 반환값에 따라 session_state·localStorage 를 조작한다.

관련 코드리뷰(자동 재개가 새 목적지 덮어쓰기·손상 JSON·만료 세션 처리)에서 지적된
분기가 바로 여기 모여 있어, 회귀를 이 모듈의 동작 테스트로 방지한다.
"""

from __future__ import annotations

import json
from typing import Literal, NamedTuple, Optional

# classify_saved_session 의 상태 코드.
#   "resume"  : 유효 → data 로 재개 예약
#   "bad"     : 파싱 실패·필수 필드 없음 → 저장 항목 제거 후 무시
#   "expired" : 너무 오래된 세션 → 저장 항목 제거 후 무시
SavedStatus = Literal["resume", "bad", "expired"]

# resume_action 의 동작 코드.
#   "go"     : 지금 재개(경로 재계획)
#   "cancel" : 재개 취소(사용자가 그새 새 목적지를 잡음)
#   "wait"   : 위치(origin) 대기 — pending 유지, 다음 rerun 재시도
ResumeAction = Literal["go", "cancel", "wait"]


class SavedSession(NamedTuple):
    status: SavedStatus
    data: Optional[dict]  # status=="resume" 일 때만 {lat, lon, label, transit}


def classify_saved_session(
    raw: str,
    now_ms: int,
    max_age_ms: int,
) -> SavedSession:
    """localStorage 원문(raw JSON 문자열)을 재개 판정 상태로 분류한다.

    - 파싱 실패·lat/lon 누락/비수치 → ("bad", None). 호출부는 손상된 키를 지운다.
    - ts 가 있고 (now_ms - ts) > max_age_ms → ("expired", None). 호출부는 키를 지운다.
      ts 가 없거나 숫자로 못 읽으면 나이 판정을 건너뛴다(옛 저장분 호환).
    - 그 외 → ("resume", {lat, lon, label, transit}). transit 는 기본 True.
    raw 는 None 이 아니어야 한다(None=대기는 호출부에서 먼저 처리).
    """
    try:
        d = json.loads(raw)
        lat, lon = float(d["lat"]), float(d["lon"])
    except (ValueError, TypeError, KeyError):
        return SavedSession("bad", None)

    ts = d.get("ts")
    if ts is not None:
        try:
            if (int(now_ms) - int(ts)) > int(max_age_ms):
                return SavedSession("expired", None)
        except (ValueError, TypeError):
            pass  # ts 형식 이상 → 나이 판정만 건너뛰고 계속

    return SavedSession("resume", {
        "lat": lat,
        "lon": lon,
        "label": d.get("label") or "",
        "transit": bool(d.get("transit", True)),
    })


def gps_poll_needed(
    *,
    running: bool,
    origin_present: bool,
    origin_coarse: bool,
    booking_armed: bool,
    dest_entry_active: bool,
) -> bool:
    """이번 rerun 에서 GPS 재폴링(_get_geolocation_high_accuracy)을 돌려야 하는지 결정.

    폴링은 값이 도착할 때마다 rerun 을 유발하고, 첫 fix 미취득 상태(origin 없음)에선
    2.5~6초 blocking 다중측정이라, 목적지 입력 도중 돌면 st_searchbox 입력이 리셋된다
    ('안드로이드에서 화면 뜨자마자 목적지 입력 시 화면 리셋' 버그의 원인).

    그래서 입력 중(dest_entry_active)에는 첫 fix 미취득이어도 폴링을 멈춘다 —
    같은 화면의 autorefresh 게이팅(`... and not _dest_entry_active()`)과 동일 기준으로
    맞춘 것이다(예전엔 GPS 폴링만 'origin 이 있을 때만' 멈춰 비대칭이라, 첫 fix 전
    입력에서 리셋이 났다). 입력을 마치고 후보를 고르거나 검색어를 비우면 dest_entry_active
    가 False 가 되어 폴링이 재개되므로 첫 위치 취득이 영구히 막히지는 않는다.

    - dest_entry_active: 안내 중이 아니고 목적지 검색어가 남아 있으며 아직 후보 미선택.
      (_dest_entry_active() 정의상 running 이면 이미 False 지만, 방어적으로 running 을 우선.)
    - 그 외에는 기존 조건 유지: 안내 중·첫 fix 미취득·대략위치(부트스트랩)·예약 대기면 폴링.
    """
    if dest_entry_active and not running:
        return False
    return running or (not origin_present) or origin_coarse or booking_armed


def resume_action(
    *,
    running: bool,
    has_route: bool,
    has_journey: bool,
    origin_present: bool,
    user_choosing_dest: bool = False,
) -> ResumeAction:
    """대기 중인 자동 재개(pending)를 지금 어떻게 처리할지 결정한다.

    - 안내 중이거나 이미 경로/여정이 있으면 "cancel" — pending 이 걸린 뒤 사용자가
      새 목적지를 잡은 경우라, 저장 세션이 새 선택을 덮어쓰지 않게 취소한다.
    - 아직 경로는 없어도 사용자가 새 목적지를 '입력/선택 중'이면(user_choosing_dest)
      마찬가지로 "cancel" — 저장 트립이 진행 중인 검색을 덮어쓰지 않게 한다.
    - 그 외로 위치가 잡혔으면 "go" — 지금 재계획해 재개한다.
    - 위치가 아직 없으면 "wait" — pending 을 유지해 다음 rerun 에서 재시도한다.
    """
    if running or has_route or has_journey or user_choosing_dest:
        return "cancel"
    if origin_present:
        return "go"
    return "wait"
