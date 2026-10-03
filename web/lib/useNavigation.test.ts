import { describe, expect, it } from "vitest";
import type { DeviationState, EngineResult } from "@walk/route-engine";
import { applyDeviationAccuracyGate } from "./useNavigation";

function makeResult(state: DeviationState, distanceFromRouteMeters: number): EngineResult {
  return {
    state,
    score: state === "on_route" ? 0.1 : 0.95,
    reasons: state === "on_route" ? ["within_route_corridor"] : ["distance_over_deviation_threshold"],
    metrics: {
      distanceFromRouteMeters,
      expectedHeadingDegrees: 90,
      headingDifferenceDegrees: 90,
      nearestSegmentIndex: 0,
      routeDistanceAlongMeters: 20,
      consecutiveThresholdBreaches: 3,
      driftDurationMs: 4_000,
      speedMetersPerSecond: 1.2,
      turnApproachActive: state === "passed_turn",
    },
    suggestedNextAction:
      state === "deviated" || state === "passed_turn"
        ? "reroute_candidate"
        : state === "drifting"
          ? "monitor"
          : "none",
  };
}

describe("applyDeviationAccuracyGate", () => {
  it("distance < accuracy이면 deviated를 drifting/monitor로 완화한다", () => {
    const decision = applyDeviationAccuracyGate(makeResult("deviated", 16), 25);

    expect(decision.fixReliable).toBe(true);
    expect(decision.distanceClearsAccuracy).toBe(false);
    expect(decision.result.state).toBe("drifting");
    expect(decision.result.suggestedNextAction).toBe("monitor");
  });

  it("distance >= accuracy이고 fix가 신뢰 가능하면 deviated를 유지한다", () => {
    const decision = applyDeviationAccuracyGate(makeResult("deviated", 25), 25);

    expect(decision.fixReliable).toBe(true);
    expect(decision.distanceClearsAccuracy).toBe(true);
    expect(decision.result.state).toBe("deviated");
    expect(decision.result.suggestedNextAction).toBe("reroute_candidate");
  });

  it("기존 30m accuracy gate를 넘으면 거리 조건을 충족해도 hard deviation을 억제한다", () => {
    const decision = applyDeviationAccuracyGate(makeResult("deviated", 40), 31);

    expect(decision.fixReliable).toBe(false);
    expect(decision.distanceClearsAccuracy).toBe(true);
    expect(decision.result.state).toBe("drifting");
    expect(decision.result.suggestedNextAction).toBe("monitor");
  });

  it("reliable passed_turn은 distance < accuracy만으로 늦추지 않는다", () => {
    const decision = applyDeviationAccuracyGate(makeResult("passed_turn", 8), 25);

    expect(decision.fixReliable).toBe(true);
    expect(decision.distanceClearsAccuracy).toBe(false);
    expect(decision.result.state).toBe("passed_turn");
    expect(decision.result.suggestedNextAction).toBe("reroute_candidate");
  });

  it("passed_turn에도 기존 30m accuracy gate는 유지한다", () => {
    const decision = applyDeviationAccuracyGate(makeResult("passed_turn", 35), 31);

    expect(decision.fixReliable).toBe(false);
    expect(decision.result.state).toBe("drifting");
    expect(decision.result.suggestedNextAction).toBe("monitor");
  });
});
