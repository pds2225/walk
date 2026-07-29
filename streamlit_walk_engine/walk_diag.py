"""도보 진단 로그 — 동의한 세션의 비식별 데이터로 문제를 진단하는 순수 함수 모듈.

걷는 동안 GPS 정확도·이탈 판정·재탐색·음성 이벤트를 시간순 레코드로 쌓아,
이탈 오판정·GPS 튐·재탐색 폭주·음성 누락 같은 문제를 데이터로 짚을 수 있게 한다.
페이지 모듈(1_Navigation.py)은 하단 ``main()`` 즉시 실행으로 import-테스트가 불가하므로
로직을 여기로 분리한다. 시각(``t_ms``)은 호출부에서 주입해 테스트 결정성을 지킨다.

원본 좌표와 목적지 문자열은 기본적으로 기록하지 않는다. 사용자가 대략 위치 포함에
별도 동의한 경우에도 좌표는 소수점 셋째 자리(약 100m 격자)로 낮춰 기록한다.
"""

from __future__ import annotations

import json
from typing import Any

DIAG_CAP = 3000  # 레코드 상한 — 초과 시 오래된 것부터 버림(1초 폴링 ≈ 50분 분량)
DEFAULT_DIAG_RETENTION_HOURS = 24
MAX_DIAG_RETENTION_HOURS = 168
COARSE_COORD_DECIMALS = 3

_COORDINATE_KEYS = frozenset({"lat", "lon", "latitude", "longitude"})
_ROUTE_IDENTITY_KEYS = frozenset({
    "address", "dest", "destination", "origin", "query", "route", "route_name",
})


def diag_record(t_ms: int, event: str, **fields: Any) -> dict:
    """진단 레코드 1건을 만든다. ``t``=밀리초 시각, ``e``=이벤트명.

    값이 None인 필드는 제외해 로그를 가볍게 유지한다(누락 필드 = 해당 없음).
    """
    rec: dict[str, Any] = {"t": int(t_ms), "e": str(event)}
    for key, value in fields.items():
        if value is not None:
            rec[key] = value
    return rec


def private_diag_record(
    t_ms: int,
    event: str,
    *,
    include_coarse_location: bool = False,
    **fields: Any,
) -> dict:
    """개인 경로를 식별할 수 있는 필드를 제거한 진단 레코드를 만든다.

    목적지·주소·검색어 같은 경로 식별 문자열은 항상 제외한다. 좌표는 기본 제외하며
    별도 동의 시에도 약 100m 격자로 양자화한다. 숫자가 아닌 좌표는 버린다.
    """
    safe: dict[str, Any] = {}
    for key, value in fields.items():
        normalized_key = str(key).lower()
        if normalized_key in _ROUTE_IDENTITY_KEYS:
            continue
        if normalized_key in _COORDINATE_KEYS:
            if include_coarse_location and isinstance(value, (int, float)):
                safe[key] = round(float(value), COARSE_COORD_DECIMALS)
            continue
        safe[key] = value
    return diag_record(t_ms, event, **safe)


def normalized_retention_hours(value: Any) -> int:
    """보존기간을 1~168시간 정수로 제한한다."""
    try:
        hours = int(value)
    except (TypeError, ValueError):
        return DEFAULT_DIAG_RETENTION_HOURS
    return max(1, min(MAX_DIAG_RETENTION_HOURS, hours))


def prune_expired(log: list, now_ms: int, retention_hours: Any) -> list:
    """보존기간을 지난 레코드와 시각이 손상된 레코드를 제거해 새 목록으로 반환한다."""
    cutoff_ms = int(now_ms) - normalized_retention_hours(retention_hours) * 60 * 60 * 1000
    kept: list = []
    for record in log:
        if not isinstance(record, dict):
            continue
        timestamp = record.get("t")
        if isinstance(timestamp, (int, float)) and cutoff_ms <= int(timestamp) <= int(now_ms):
            kept.append(record)
    return kept


def append_capped(log: list, record: dict, cap: int = DIAG_CAP) -> list:
    """레코드를 로그에 추가하고, 상한을 넘으면 앞(오래된)에서 잘라낸다. 로그를 그대로 반환."""
    log.append(record)
    if len(log) > cap:
        del log[: len(log) - cap]
    return log


def diag_json(log: list) -> str:
    """로그를 옮기기 쉬운 JSON 문자열로 직렬화(한글 보존)."""
    return json.dumps(log, ensure_ascii=False)


def _percentile(sorted_vals: list[float], pct: float) -> float:
    """이미 정렬된 값 목록의 백분위수(선형 보간). 빈 목록은 0.0."""
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * (pct / 100.0)
    lo = int(k)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = k - lo
    return sorted_vals[lo] * (1.0 - frac) + sorted_vals[hi] * frac


def diag_summary(log: list) -> dict:
    """로그 요약 통계 — 화면에 한눈에 보여줄 값.

    레코드 수, 기록 시간(초), 이벤트별 개수, 이탈 상태 분포, GPS 정확도 p50/p90/최대.
    빈 로그는 ``{"records": 0}``.
    """
    if not log:
        return {"records": 0}
    events: dict[str, int] = {}
    states: dict[str, int] = {}
    tick_states: dict[str, int] = {}  # 판정(tick) 레코드에서만 센 상태 — 비율 계산의 분모/분자 일치용
    accs: list[float] = []
    times: list[float] = []
    for rec in log:
        ev = str(rec.get("e", "?"))
        events[ev] = events.get(ev, 0) + 1
        state = rec.get("st")
        if state:
            states[state] = states.get(state, 0) + 1
            if ev == "tick":  # alert·reroute 레코드도 st 를 달고 있어, 비율엔 tick 만 센다
                tick_states[state] = tick_states.get(state, 0) + 1
        acc = rec.get("acc")
        if isinstance(acc, (int, float)):
            accs.append(float(acc))
        t = rec.get("t")
        if isinstance(t, (int, float)):
            times.append(float(t))
    summary: dict[str, Any] = {
        "records": len(log),
        "span_s": round((max(times) - min(times)) / 1000.0, 1) if len(times) >= 2 else 0.0,
        "events": events,
        "states": states,
        "tick_states": tick_states,
    }
    if accs:
        accs_sorted = sorted(accs)
        summary["acc_p50"] = round(_percentile(accs_sorted, 50), 1)
        summary["acc_p90"] = round(_percentile(accs_sorted, 90), 1)
        summary["acc_max"] = round(max(accs), 1)
    return summary


def diag_findings(summary: dict) -> list[str]:
    """요약 통계에서 사람이 읽는 '자동 진단 힌트'를 뽑는다(순수 함수).

    정밀 진단이 아니라 '무엇을 의심할지' 안내용 — GPS 정확도, 재탐색 빈도, 이탈 비율,
    음성 미작동 의심, 표본 부족을 대략 임계치로 판단한다. 로그가 비면 빈 리스트,
    문제가 없으면 '특이사항 없음' 1건을 돌려준다(사용자가 '정상'임을 알 수 있게).
    """
    if not summary or summary.get("records", 0) == 0:
        return []
    events = summary.get("events", {}) or {}
    # 이탈 관련 비율은 '판정(tick) 레코드'만으로 센다 — alert·reroute 레코드도 st 를 달고
    # 있어 states(전체)를 쓰면 분자가 부풀어 15/10 같은 잘못된 비율이 나온다(dev ≤ ticks 보장).
    tick_states = summary.get("tick_states", summary.get("states", {})) or {}
    ticks = events.get("tick", 0)
    findings: list[str] = []

    p90 = summary.get("acc_p90")
    if not isinstance(p90, (int, float)):
        # 정확도 데이터가 없으면 정확도 판단을 못 한다 — '정상'이라고 단정하지 않도록
        # 명시(이 항목이 있으면 아래 '특이사항 없음' 올클리어가 뜨지 않아 오해를 막는다).
        findings.append("ℹ️ GPS 정확도 데이터 없음 — 정확도는 판단할 수 없음")
    elif p90 > 50:
        findings.append(f"🔴 GPS 정확도 매우 낮음 (p90 {p90}m) — 위치 튐·이탈 오판정 가능성 큼")
    elif p90 > 30:
        findings.append(f"🟡 GPS 정확도 낮음 (p90 {p90}m) — 이탈 오판정 가능")

    reroutes = events.get("reroute", 0)
    span_min = max(summary.get("span_s", 0.0) / 60.0, 0.01)
    if reroutes >= 5 or (reroutes >= 2 and reroutes / span_min > 1.0):
        findings.append(f"🟡 재탐색 잦음 ({reroutes}회) — 경로 이탈이 반복됨(신호·경로 확인)")

    dev = tick_states.get("deviated", 0) + tick_states.get("passed_turn", 0)
    if ticks >= 10 and dev / ticks > 0.3:
        findings.append(f"🟡 이탈 판정 비율 높음 ({dev}/{ticks} tick)")

    # 알림 발생 = 전체 알림(alert) + 저정확도 약경고(weak_toast) 둘 다 포함 — 신호가 나빠
    # 이탈을 약경고로만 알린 경우까지 '알림 0'으로 오판해 음성 미작동으로 몰지 않게 한다.
    notified = events.get("alert", 0) + events.get("weak_toast", 0)
    if dev >= 3 and notified == 0:
        findings.append("🔴 이탈이 있었는데 음성/알림 기록 0회 — 음성 미작동 의심")

    if ticks < 5:
        findings.append(f"ℹ️ 표본이 적음 (tick {ticks}) — 더 걸어야 진단 신뢰도가 올라감")

    if not findings:
        findings.append("🟢 특이사항 없음 — 정확도·이탈·음성 모두 정상 범위")
    return findings
