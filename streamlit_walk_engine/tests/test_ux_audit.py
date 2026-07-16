"""walk UX 자율 감사 하네스 테스트 — '불편을 실제로 잡아내는지'까지 검증(고무도장 방지)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine import EngineConfig  # noqa: E402
from scenarios import get_scenarios  # noqa: E402
import ux_audit  # noqa: E402


def test_canonical_scenarios_have_no_false_alarm_or_missed():
    """기본 설정에서 4대 시나리오는 UX 불편 0 — 이후 튜닝 회귀를 잡는 가드."""
    report = ux_audit.run_ux_audit()
    by_key = {a.key: a for a in report.scenarios}
    # 정상보행은 어떤 이탈도 없어야(헛경고 0)
    assert by_key["normal_walking"].pains == []
    # 기대 상태(이탈/회전미이행)는 실제로 발생해야(놓침 0)
    for key in ("mild_drift", "strong_deviation", "missed_turn"):
        assert not any(p.startswith("missed") for p in by_key[key].pains), by_key[key].pains
    assert report.ok, ux_audit.format_report(report)


def test_count_episodes_detects_flip_flop():
    """이탈 구간이 끊겨 여러 번 나오면 episode 수로 깜빡임을 센다(순수 함수)."""
    assert ux_audit._count_episodes(["on_route"] * 5) == 0
    assert ux_audit._count_episodes(["on_route", "drifting", "drifting", "on_route"]) == 1
    # 나갔다 들어왔다 두 번 → 2 episode(잔소리성 깜빡임)
    assert ux_audit._count_episodes(
        ["on_route", "deviated", "on_route", "deviated", "on_route"]) == 2


def test_detects_missed_under_loose_config():
    """임계를 비현실적으로 크게 하면 강한 이탈도 확정 안 됨 → 'missed' 불편을 잡아야 한다."""
    loose = EngineConfig(
        route_drift_distance_threshold_meters=999.0,
        route_deviation_distance_threshold_meters=999.0,
        strong_deviation_distance_threshold_meters=999.0,
    )
    strong = next(s for s in get_scenarios() if s.key == "strong_deviation")
    audit = ux_audit.audit_scenario(strong, loose)
    assert any(p.startswith("missed") for p in audit.pains), audit.pains


def test_detects_false_alarm_under_tight_config_via_noise():
    """임계를 아주 작게 하면 지터 정상보행이 헛경고를 낸다 → 헛경고율 상한 초과로 불편 판정."""
    tight = EngineConfig(
        route_drift_distance_threshold_meters=2.0,
        route_deviation_distance_threshold_meters=3.0,
        strong_deviation_distance_threshold_meters=5.0,
        minimum_consecutive_samples_for_deviation=1,
        minimum_drift_duration_ms=1,
    )
    report = ux_audit.run_ux_audit(config=tight, noise_runs=20)
    assert report.noise_false_alarm_rate > ux_audit.NOISE_FALSE_ALARM_MAX_RATE
    assert not report.ok


def test_noise_false_alarm_rate_within_bound_default():
    """기본 설정의 지터 정상보행 헛경고율은 상한 이하(실기기 GPS 노이즈 강건성)."""
    report = ux_audit.run_ux_audit(noise_runs=20)
    assert report.noise_false_alarm_rate <= ux_audit.NOISE_FALSE_ALARM_MAX_RATE


def test_format_report_is_readable():
    report = ux_audit.run_ux_audit()
    text = ux_audit.format_report(report)
    assert "walk UX 자율 감사 리포트" in text
    assert "헛경고율" in text
