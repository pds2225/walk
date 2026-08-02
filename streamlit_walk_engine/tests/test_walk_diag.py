"""Unit tests for walk_diag.py — 도보 진단 로그 순수 함수 검증.

커버 범위:
  diag_record   → t/e 필드 + None 제외
  private_diag_record → 목적지 제거·좌표 기본 제외·대략 위치 양자화
  prune_expired → 보존기간 만료 데이터 제거
  append_capped → 상한 초과 시 오래된 것부터 제거
  diag_json     → 한글 보존 직렬화
  diag_summary  → 이벤트/상태 카운트, 정확도 p50/p90, 기록 시간
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from walk_diag import (
    diag_report,
    COARSE_COORD_DECIMALS, DEFAULT_DIAG_RETENTION_HOURS, DIAG_CAP,
    append_capped, diag_findings, diag_json, diag_record, diag_summary,
    normalized_retention_hours, private_diag_record, prune_expired,
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


class TestPrivateDiagRecord:
    def test_original_coordinates_and_route_identity_are_removed_by_default(self):
        rec = private_diag_record(
            1000, "start", lat=37.566543, lon=126.978123,
            dest="집", address="서울 어딘가", st="on_route",
        )
        assert rec == {"t": 1000, "e": "start", "st": "on_route"}

    def test_separate_opt_in_keeps_only_coarse_coordinates(self):
        rec = private_diag_record(
            1000, "tick", include_coarse_location=True,
            latitude=37.566543, longitude=126.978123,
        )
        assert rec["latitude"] == round(37.566543, COARSE_COORD_DECIMALS)
        assert rec["longitude"] == round(126.978123, COARSE_COORD_DECIMALS)
        assert rec["latitude"] != 37.566543
        assert rec["longitude"] != 126.978123

    def test_non_numeric_coordinate_is_dropped(self):
        rec = private_diag_record(
            1000, "tick", include_coarse_location=True, lat="37.5", acc=10,
        )
        assert "lat" not in rec
        assert rec["acc"] == 10

    def test_nested_coordinates_and_route_identity_are_scrubbed(self):
        rec = private_diag_record(
            1000,
            "tick",
            payload={
                "lat": 37.566543,
                "lon": 126.978123,
                "dest": "집",
                "acc": 8,
                "nested": [{"latitude": 37.1, "query": "카페"}],
            },
        )
        assert rec["payload"] == {"acc": 8, "nested": [{}]}

    def test_nested_coarse_opt_in_quantizes_coordinates(self):
        rec = private_diag_record(
            1000,
            "tick",
            include_coarse_location=True,
            payload={"lat": 37.566543, "dest": "집"},
        )
        assert rec["payload"] == {"lat": round(37.566543, COARSE_COORD_DECIMALS)}
        assert "dest" not in rec["payload"]


class TestRetention:
    def test_prunes_expired_future_and_malformed_records(self):
        hour = 60 * 60 * 1000
        now = 10 * hour
        log = [
            diag_record(now - hour, "keep"),
            diag_record(now - 3 * hour, "drop"),
            diag_record(now + 1, "future"),
            {"e": "missing-time"},
            "bad",
        ]
        assert [record["e"] for record in prune_expired(log, now, 2)] == ["keep"]

    def test_retention_is_bounded_and_invalid_value_uses_default(self):
        assert normalized_retention_hours(0) == 1
        assert normalized_retention_hours(9999) == 168
        assert normalized_retention_hours("bad") == DEFAULT_DIAG_RETENTION_HOURS


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

    def test_counts_suppressed_decisions_by_reason(self):
        # 울린 경고만 기록하면 억제가 과한지 알 수 없다 — 억제 사유별 횟수를 요약에 남긴다.
        log = [diag_record(i * 1000, "tick", st="drifting", acc=10.0) for i in range(10)]
        log += [
            diag_record(20000, "alert_muted", st="drifting", why="drift_cooldown"),
            diag_record(21000, "alert_muted", st="drifting", why="drift_cooldown"),
            diag_record(22000, "alert_muted", st="on_route", why="mute"),
            diag_record(23000, "reroute_muted", st="deviated", why="stationary"),
        ]
        summ = diag_summary(log)

        assert summ["muted"] == {
            "alert:drift_cooldown": 2,
            "alert:mute": 1,
            "reroute:stationary": 1,
        }
        out = diag_findings(summ)
        assert any("억제된 판정 4회" in f for f in out)

    def test_flags_when_suppression_outweighs_alerts(self):
        # 발화보다 억제가 훨씬 많으면 쿨다운·제자리 판정이 과할 수 있다고 알린다.
        log = [diag_record(i * 1000, "tick", st="drifting", acc=10.0) for i in range(10)]
        log.append(diag_record(50000, "alert", st="drifting"))
        log += [
            diag_record(50000 + i, "alert_muted", st="drifting", why="drift_cooldown")
            for i in range(5)
        ]
        out = diag_findings(diag_summary(log))

        assert any("억제가 발화보다 많음" in f for f in out)

    def test_no_suppression_keeps_all_clear(self):
        log = [diag_record(i * 1000, "tick", st="on_route", acc=10.0) for i in range(10)]
        summ = diag_summary(log)

        assert summ["muted"] == {}
        assert any("특이사항 없음" in f for f in diag_findings(summ))


class TestDiagReport:
    """내려받기 없이 붙여넣기로 넘길 수 있는 한 화면 요약."""

    def test_empty_log_reports_no_records(self):
        assert diag_report(diag_summary([])) == "walk 진단 요약: 기록 없음"

    def test_report_includes_distributions_counts_and_settings(self):
        log = [
            diag_record(i * 1000, "tick", st="on_route", acc=12.0,
                        dist=3.0 + i, hdiff=10.0, spd=1.2)
            for i in range(10)
        ]
        log += [
            diag_record(20000, "alert", st="drifting"),
            diag_record(21000, "alert_muted", st="drifting", why="drift_cooldown"),
        ]
        report = diag_report(diag_summary(log), {"drift_m": 10, "hyst": 0.8})

        assert "walk 진단 요약" in report
        assert "tick 10" in report and "alert 1" in report
        assert "alert:drift_cooldown 1" in report
        assert "경로 횡거리: p50" in report      # 임계값 조정의 핵심 분포
        assert "GPS 정확도: p50 12.0m" in report
        assert "속도: p50 1.2m/s" in report
        assert "drift_m 10" in report and "hyst 0.8" in report
        # 좌표는 로그에도 요약에도 남지 않는다
        assert "lat" not in report and "lon" not in report

    def test_missing_fields_say_no_data_instead_of_zero(self):
        # 분포 데이터가 없는데 0 으로 적으면 '정확도 0m' 처럼 잘못 읽힌다.
        log = [diag_record(i * 1000, "tick", st="on_route") for i in range(5)]
        report = diag_report(diag_summary(log))

        assert "GPS 정확도: 데이터 없음" in report
        assert "경로 횡거리: 데이터 없음" in report

    def test_tick_only_distributions_ignore_alert_records(self):
        # alert 레코드에 dist 가 실려도 판정 분포를 오염시키면 안 된다.
        log = [diag_record(i * 1000, "tick", st="on_route", dist=2.0) for i in range(5)]
        log.append(diag_record(9000, "alert", st="deviated", dist=99.0))
        summ = diag_summary(log)

        assert summ["dist_max"] == 2.0
