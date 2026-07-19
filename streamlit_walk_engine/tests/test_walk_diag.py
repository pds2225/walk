"""Unit tests for walk_diag.py — 도보 진단 로그 순수 함수 검증.

커버 범위:
  diag_record   → t/e 필드 + None 제외
  append_capped → 상한 초과 시 오래된 것부터 제거
  diag_json     → 한글 보존 직렬화
  diag_summary  → 이벤트/상태 카운트, 정확도 p50/p90, 기록 시간
"""

import base64
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from walk_diag import (
    DIAG_CAP, GITHUB_LOG_BRANCH, append_capped, diag_findings, diag_json, diag_record,
    diag_summary, github_upload_payload,
)


class TestDiagRecord:
    def test_has_time_and_event(self):
        rec = diag_record(1234, "tick")
        assert rec["t"] == 1234 and rec["e"] == "tick"

    def test_drops_none_fields_keeps_others(self):
        rec = diag_record(1, "tick", lat=37.5, acc=None, st="on_route")
        assert rec["lat"] == 37.5 and rec["st"] == "on_route"
        assert "acc" not in rec  # None 은 로그에서 제외

    def test_time_coerced_to_int(self):
        rec = diag_record(1000.9, "x")
        assert rec["t"] == 1000 and isinstance(rec["t"], int)


class TestAppendCapped:
    def test_appends_in_order(self):
        log = []
        append_capped(log, diag_record(1, "a"))
        append_capped(log, diag_record(2, "b"))
        assert [r["e"] for r in log] == ["a", "b"]

    def test_drops_oldest_beyond_cap(self):
        log = []
        for i in range(5):
            append_capped(log, diag_record(i, "t"), cap=3)
        assert len(log) == 3
        assert [r["t"] for r in log] == [2, 3, 4]  # 오래된 0,1 제거

    def test_default_cap_is_bounded(self):
        log = []
        for i in range(DIAG_CAP + 10):
            append_capped(log, diag_record(i, "t"))
        assert len(log) == DIAG_CAP
        assert log[0]["t"] == 10  # 앞 10개 제거됨


class TestDiagJson:
    def test_preserves_korean(self):
        payload = diag_json([diag_record(1, "alert", note="경로 이탈")])
        assert "경로 이탈" in payload
        assert json.loads(payload)[0]["note"] == "경로 이탈"


class TestDiagSummary:
    def test_empty_log(self):
        assert diag_summary([]) == {"records": 0}

    def test_counts_events_states_and_span(self):
        log = [
            diag_record(1000, "tick", st="on_route", acc=10.0),
            diag_record(2000, "tick", st="on_route", acc=20.0),
            diag_record(3000, "tick", st="deviated", acc=30.0),
            diag_record(4000, "reroute"),
            diag_record(5000, "alert", st="deviated"),
        ]
        s = diag_summary(log)
        assert s["records"] == 5
        assert s["span_s"] == 4.0
        assert s["events"] == {"tick": 3, "reroute": 1, "alert": 1}
        assert s["states"] == {"on_route": 2, "deviated": 2}

    def test_accuracy_percentiles(self):
        log = [diag_record(i * 1000, "tick", acc=float(a))
               for i, a in enumerate([10, 20, 30, 40, 100])]
        s = diag_summary(log)
        assert s["acc_p50"] == 30.0     # 중앙값
        assert s["acc_max"] == 100.0
        assert s["acc_p90"] >= s["acc_p50"]

    def test_span_zero_for_single_record(self):
        assert diag_summary([diag_record(999, "start")])["span_s"] == 0.0


class TestGithubUploadPayload:
    def test_path_and_branch_and_message(self):
        log = [diag_record(1, "tick"), diag_record(2, "reroute")]
        path, body = github_upload_payload("abc123", 1699999999000, log)
        assert path == "logs/abc123-1699999999000.json"
        assert body["branch"] == GITHUB_LOG_BRANCH
        assert "2 recs" in body["message"]

    def test_content_is_base64_of_json_roundtrip(self):
        log = [diag_record(1, "alert", note="경로 이탈")]
        _, body = github_upload_payload("s", 1000, log)
        decoded = json.loads(base64.b64decode(body["content"]).decode("utf-8"))
        assert decoded[0]["note"] == "경로 이탈"  # 한글 base64 왕복 보존

    def test_session_id_sanitized_against_path_injection(self):
        # 파일명에 안전한 문자만 남긴다 — 경로 주입(../)·특수문자 제거
        path, _ = github_upload_payload("../../etc/passwd!@#", 1000, [])
        assert ".." not in path and "!" not in path and "@" not in path
        assert path.startswith("logs/") and path.endswith("-1000.json")

    def test_empty_session_id_falls_back(self):
        path, _ = github_upload_payload("", 1000, [])
        assert path == "logs/sess-1000.json"


class TestDiagFindings:
    """요약 → 사람이 읽는 자동 진단 힌트."""

    def _summ(self, log):
        return diag_summary(log)

    def test_empty_log_no_findings(self):
        assert diag_findings({"records": 0}) == []
        assert diag_findings({}) == []

    def test_healthy_log_reports_ok(self):
        log = [diag_record(i * 1000, "tick", st="on_route", acc=10.0) for i in range(20)]
        log.append(diag_record(21000, "alert", st="deviated"))
        out = diag_findings(diag_summary(log))
        assert any("특이사항 없음" in f for f in out)

    def test_flags_low_gps_accuracy(self):
        log = [diag_record(i * 1000, "tick", st="on_route", acc=55.0) for i in range(20)]
        out = diag_findings(diag_summary(log))
        assert any("GPS 정확도 매우 낮음" in f for f in out)

    def test_flags_silent_voice_when_deviations_but_no_alert(self):
        # 이탈(deviated) tick 은 있는데 alert 이벤트가 0 → 음성 미작동 의심
        log = [diag_record(i * 1000, "tick", st="deviated", acc=10.0) for i in range(12)]
        out = diag_findings(diag_summary(log))
        assert any("음성" in f and "0회" in f for f in out)

    def test_flags_small_sample(self):
        log = [diag_record(i * 1000, "tick", acc=8.0) for i in range(3)]
        out = diag_findings(diag_summary(log))
        assert any("표본이 적음" in f for f in out)

    def test_deviation_ratio_uses_tick_states_only(self):
        # alert 레코드도 st='deviated'를 달지만, 이탈 비율 분자는 tick 만 세야 한다
        # (안 그러면 dev 가 ticks 를 넘어 '이탈 비율 높음'이 오탐).
        log = [diag_record(i * 1000, "tick", st="on_route", acc=10.0) for i in range(10)]
        log += [diag_record(100000 + i, "alert", st="deviated") for i in range(8)]
        summ = diag_summary(log)
        assert summ["tick_states"].get("deviated", 0) == 0  # tick 중 이탈 0
        out = diag_findings(summ)
        assert not any("이탈 판정 비율 높음" in f for f in out)

    def test_weak_toast_counts_as_notification(self):
        # 저정확도 이탈은 alert 대신 weak_toast 로 알림 → '음성 미작동' 오탐 금지
        log = [diag_record(i * 1000, "tick", st="deviated", acc=40.0) for i in range(12)]
        log.append(diag_record(99000, "weak_toast", st="deviated"))
        out = diag_findings(diag_summary(log))
        assert not any("음성 미작동" in f for f in out)

    def test_no_accuracy_data_does_not_claim_all_clear(self):
        # acc 값이 없으면 '정확도 정상' 올클리어를 띄우지 않고 '데이터 없음'을 명시한다
        log = [diag_record(i * 1000, "tick") for i in range(6)]  # acc 없음
        out = diag_findings(diag_summary(log))
        assert any("정확도 데이터 없음" in f for f in out)
        assert not any("특이사항 없음" in f for f in out)
