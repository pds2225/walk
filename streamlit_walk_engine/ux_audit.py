"""walk 자율 UX 테스트 하네스 — 가상환경(시뮬 보행)으로 UX 불편을 자동 발굴한다.

목적(사용자 요청 2026-07-16): "walk를 혼자 가상환경에서 테스트해 UX 관점의 불편한
부분을 개발에 반영해 지속 보완." 야간 자동개발이 '코드가 맞나(버그·테스트)'만 보던
한계를 넘어, **사용자 체감(UX) 지표**를 시뮬로 재고 임계 초과를 '불편'으로 플래그한다.

측정 지표(보행 1회당):
- reroute_signal_count : 재탐색 후보 신호 횟수(과잉이면 헛 재탐색 체감)
- deviation_episodes   : 이탈(비 on_route) 구간이 몇 번 끊겨 나오나(많으면 깜빡임/잔소리)
- max_distance_m       : 경로에서 최대로 벌어진 거리
- detection_lag_samples: 첫 임계 초과 → 이탈 '확정'까지 지연 표본 수(클수록 뒤늦은 감지)
- turn_lead_samples    : 회전 예고 구간을 회전 전 몇 표본 앞서 잡았나(작으면 예고가 늦음)

UX 불편 판정(임계는 아래 상수 — 야간개발이 조정·회귀 감시):
- false_alarm    : 계속 경로 위(expected=on_route만)인데 이탈/회전미이행이 뜸(헛경고)
- flip_flop      : 한 번 보행에 이탈 구간이 여러 번 끊겨 나옴(상태 깜빡임)
- late_detection : 첫 이탈 후 확정까지 지연이 큼(뒤늦은 감지)
- missed         : 이탈/회전미이행이 나와야 하는데 끝까지 안 뜸(놓침)

순수 모듈: streamlit·네트워크 의존 없음. `python -m streamlit_walk_engine.ux_audit`(또는
직접 실행) 시 리포트를 출력하고, 불편이 하나라도 있으면 exit code 1(야간개발 게이트용).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

if __package__:
    from .engine import EngineConfig, RouteDeviationEngine, PositionSample
    from .scenarios import Scenario, get_scenarios, make_sample, ORIGIN, move_by_meters
else:  # 직접 실행(python ux_audit.py) 지원 — scenarios.py 와 동일 패턴
    from engine import EngineConfig, RouteDeviationEngine, PositionSample  # type: ignore
    from scenarios import Scenario, get_scenarios, make_sample, ORIGIN, move_by_meters  # type: ignore


# ── UX 불편 임계(야간개발이 조정·회귀 감시하는 튜닝 포인트) ─────────────────────
LATE_DETECTION_MAX_SAMPLES = 3      # 첫 임계 초과 후 이 표본 수 넘게 늦게 확정되면 '뒤늦음'
FLIP_FLOP_MAX_EPISODES = 1          # 한 보행에 이탈 구간이 이 개수 초과로 끊기면 '깜빡임'
NOISE_FALSE_ALARM_MAX_RATE = 0.10   # 지터 정상보행에서 헛경고율 상한(10%)


@dataclass
class ScenarioAudit:
    key: str
    name: str
    reroute_signal_count: int
    deviation_episodes: int
    max_distance_m: float
    detection_lag_samples: Optional[int]
    turn_lead_samples: int
    states: tuple[str, ...]
    pains: list[str] = field(default_factory=list)


@dataclass
class AuditReport:
    scenarios: list[ScenarioAudit]
    noise_false_alarm_rate: float
    noise_runs: int

    @property
    def pain_count(self) -> int:
        return sum(len(s.pains) for s in self.scenarios) + (
            1 if self.noise_false_alarm_rate > NOISE_FALSE_ALARM_MAX_RATE else 0
        )

    @property
    def ok(self) -> bool:
        return self.pain_count == 0


def _run_engine(scenario: Scenario, config: Optional[EngineConfig] = None):
    """시나리오 표본을 엔진에 순차 투입하고 결과 리스트를 반환(가상 보행 1회)."""
    engine = RouteDeviationEngine(scenario.route, config)
    return [engine.process_sample(s) for s in scenario.samples]


def _count_episodes(states: list[str]) -> int:
    """비 on_route 구간(연속 덩어리)의 개수 — 여러 번 끊기면 상태 깜빡임."""
    episodes = 0
    prev_dev = False
    for st in states:
        dev = st != "on_route"
        if dev and not prev_dev:
            episodes += 1
        prev_dev = dev
    return episodes


def audit_scenario(scenario: Scenario, config: Optional[EngineConfig] = None) -> ScenarioAudit:
    cfg = config or EngineConfig()
    results = _run_engine(scenario, cfg)
    states = [r.state for r in results]
    dists = [r.metrics.distance_from_route_meters for r in results]
    actions = [r.suggested_next_action for r in results]

    # 첫 임계 초과(drift threshold) → 이탈 '확정'(deviated/passed_turn)까지 지연 표본.
    first_breach = next((i for i, d in enumerate(dists)
                         if d >= cfg.route_drift_distance_threshold_meters), None)
    first_alarm = next((i for i, s in enumerate(states)
                        if s in ("deviated", "passed_turn")), None)
    detection_lag = (first_alarm - first_breach
                     if first_breach is not None and first_alarm is not None
                     and first_alarm >= first_breach else None)

    # 회전 예고 리드: 회전 확정(passed_turn) 전에 approach 구간을 잡은 표본 수.
    turn_lead = sum(1 for r in results if r.metrics.turn_approach_active)

    audit = ScenarioAudit(
        key=scenario.key,
        name=scenario.name,
        reroute_signal_count=actions.count("reroute_candidate"),
        deviation_episodes=_count_episodes(states),
        max_distance_m=round(max(dists), 1) if dists else 0.0,
        detection_lag_samples=detection_lag,
        turn_lead_samples=turn_lead,
        states=tuple(states),
    )

    expected = set(scenario.expected_states)
    seen_dev = {s for s in states if s != "on_route"}

    # 1) 헛경고: 계속 경로 위(expected=on_route만)인데 이탈/회전미이행이 떴다.
    if expected == {"on_route"} and seen_dev:
        audit.pains.append(f"false_alarm: 정상보행인데 {sorted(seen_dev)} 발생")
    # 2) 놓침: 이탈/회전미이행이 나와야 하는데 끝까지 안 떴다.
    missing = {s for s in ("deviated", "passed_turn") if s in expected and s not in seen_dev}
    if missing:
        audit.pains.append(f"missed: 기대 {sorted(missing)} 미발생")
    # 3) 깜빡임: 이탈 구간이 여러 번 끊겨 나온다(잔소리성 알림).
    if audit.deviation_episodes > FLIP_FLOP_MAX_EPISODES:
        audit.pains.append(f"flip_flop: 이탈 구간 {audit.deviation_episodes}회 끊김")
    # 4) 뒤늦은 감지: 첫 임계 초과 후 확정까지 지연이 크다.
    if detection_lag is not None and detection_lag > LATE_DETECTION_MAX_SAMPLES:
        audit.pains.append(f"late_detection: 확정까지 {detection_lag}표본 지연")

    return audit


def _jitter(value: float, seed: int, spread: float = 6.0) -> float:
    """결정론적 지터(±spread m 근사) — random 미사용(재현성·워크플로 호환).

    seed 로 사인 파형을 흔들어 표본마다 다른, 그러나 재현 가능한 오프셋을 만든다.
    """
    return spread * math.sin(seed * 2.399963)  # 황금각 유사 — 표본 간 상관 최소화


def expand_with_noise(scenario: Scenario, runs: int) -> list[Scenario]:
    """정상보행 시나리오에 GPS 지터를 얹은 변형 다수 생성 — 헛경고율 통계용."""
    variants: list[Scenario] = []
    for run in range(runs):
        jittered: list[PositionSample] = []
        for i, s in enumerate(scenario.samples):
            de = _jitter(1.0, run * 97 + i * 7)
            dn = _jitter(1.0, run * 97 + i * 7 + 3)
            c = move_by_meters(ORIGIN,
                               _local_east(s) + de, _local_north(s) + dn)
            jittered.append(PositionSample(
                latitude=c.latitude, longitude=c.longitude,
                heading_degrees=s.heading_degrees,
                speed_meters_per_second=s.speed_meters_per_second,
                timestamp_ms=s.timestamp_ms,
            ))
        variants.append(Scenario(
            key=f"{scenario.key}_noise{run}", name=scenario.name,
            description="jitter", expected_states=scenario.expected_states,
            route=scenario.route, samples=jittered,
            positions=scenario.positions,
        ))
    return variants


def _local_east(sample: PositionSample) -> float:
    cos_lat = math.cos(math.radians(ORIGIN.latitude))
    return (sample.longitude - ORIGIN.longitude) * 111_111.0 * cos_lat


def _local_north(sample: PositionSample) -> float:
    return (sample.latitude - ORIGIN.latitude) * 111_111.0


def run_ux_audit(config: Optional[EngineConfig] = None, noise_runs: int = 20) -> AuditReport:
    """전체 UX 감사 — 4대 시나리오 + 정상보행 지터 변형으로 헛경고율까지 측정."""
    scenarios = get_scenarios()
    audits = [audit_scenario(s, config) for s in scenarios]

    # 정상보행 지터: 헛경고(정상인데 이탈로 뜸) 비율 = 실기기 GPS 노이즈 강건성 프록시.
    normal = next((s for s in scenarios if s.key == "normal_walking"), None)
    false_alarms = 0
    total = 0
    if normal is not None and noise_runs > 0:
        for variant in expand_with_noise(normal, noise_runs):
            states = [r.state for r in _run_engine(variant, config)]
            total += 1
            if any(s != "on_route" for s in states):
                false_alarms += 1
    rate = round(false_alarms / total, 3) if total else 0.0

    return AuditReport(scenarios=audits, noise_false_alarm_rate=rate, noise_runs=total)


def format_report(report: AuditReport) -> str:
    lines = ["=== walk UX 자율 감사 리포트 ==="]
    for a in report.scenarios:
        mark = "✅" if not a.pains else "⚠️"
        lag = "-" if a.detection_lag_samples is None else f"{a.detection_lag_samples}"
        lines.append(
            f"{mark} [{a.key}] {a.name} | 재탐색신호 {a.reroute_signal_count} · "
            f"이탈구간 {a.deviation_episodes} · 최대이탈 {a.max_distance_m}m · "
            f"확정지연 {lag} · 회전예고표본 {a.turn_lead_samples}"
        )
        for p in a.pains:
            lines.append(f"    ⚠️ {p}")
    nf = "✅" if report.noise_false_alarm_rate <= NOISE_FALSE_ALARM_MAX_RATE else "⚠️"
    lines.append(
        f"{nf} 지터 정상보행 헛경고율 {report.noise_false_alarm_rate:.1%} "
        f"(n={report.noise_runs}, 상한 {NOISE_FALSE_ALARM_MAX_RATE:.0%})"
    )
    lines.append(
        f"— UX 불편 총 {report.pain_count}건 → "
        + ("이상 없음(개선 불필요)" if report.ok else "개선 대상(야간개발이 후속 처리)")
    )
    return "\n".join(lines)


def main() -> int:
    # Windows 콘솔(cp949)에서 이모지·한글이 깨지지 않게 UTF-8 로 출력.
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except (AttributeError, ValueError):
        pass
    report = run_ux_audit()
    print(format_report(report))
    return 0 if report.ok else 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
