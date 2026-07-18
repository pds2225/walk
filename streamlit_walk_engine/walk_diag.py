"""도보 진단 로그 — 실제 보행 데이터로 문제를 진단하기 위한 순수 함수 모듈.

걷는 동안 GPS 좌표·정확도·이탈 판정·재탐색·음성 이벤트를 시간순 레코드로 쌓아,
이탈 오판정·GPS 튐·재탐색 폭주·음성 누락 같은 문제를 데이터로 짚을 수 있게 한다.
페이지 모듈(1_Navigation.py)은 하단 ``main()`` 즉시 실행으로 import-테스트가 불가하므로
로직을 여기로 분리한다. 시각(``t_ms``)은 호출부에서 주입해 테스트 결정성을 지킨다.
"""

from __future__ import annotations

import json
from typing import Any

DIAG_CAP = 3000  # 레코드 상한 — 초과 시 오래된 것부터 버림(1초 폴링 ≈ 50분 분량)


def diag_record(t_ms: int, event: str, **fields: Any) -> dict:
    """진단 레코드 1건을 만든다. ``t``=밀리초 시각, ``e``=이벤트명.

    값이 None인 필드는 제외해 로그를 가볍게 유지한다(누락 필드 = 해당 없음).
    """
    rec: dict[str, Any] = {"t": int(t_ms), "e": str(event)}
    for key, value in fields.items():
        if value is not None:
            rec[key] = value
    return rec


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
    accs: list[float] = []
    times: list[float] = []
    for rec in log:
        ev = str(rec.get("e", "?"))
        events[ev] = events.get(ev, 0) + 1
        state = rec.get("st")
        if state:
            states[state] = states.get(state, 0) + 1
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
    }
    if accs:
        accs_sorted = sorted(accs)
        summary["acc_p50"] = round(_percentile(accs_sorted, 50), 1)
        summary["acc_p90"] = round(_percentile(accs_sorted, 90), 1)
        summary["acc_max"] = round(max(accs), 1)
    return summary
