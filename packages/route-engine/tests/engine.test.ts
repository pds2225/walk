import { describe, expect, it } from "vitest";

import {
  DEFAULT_WALKING_ENGINE_CONFIG,
  RouteDeviationEngine,
} from "../src/index.js";
import { moveCoordinateByMeters } from "../src/geometry/index.js";
import type { Coordinate, PositionSample, RouteModel } from "../src/types/index.js";

const ORIGIN: Coordinate = {
  latitude: 37.5665,
  longitude: 126.978,
};

function buildStraightRoute(): RouteModel {
  return {
    polyline: [ORIGIN, moveCoordinateByMeters(ORIGIN, 100, 0)],
    turnPoints: [],
  };
}

function buildLeftTurnRoute(): RouteModel {
  return {
    polyline: [
      ORIGIN,
      moveCoordinateByMeters(ORIGIN, 40, 0),
      moveCoordinateByMeters(ORIGIN, 40, 40),
    ],
    turnPoints: [
      {
        id: "turn-left-1",
        coordinate: moveCoordinateByMeters(ORIGIN, 40, 0),
        routeIndex: 1,
        direction: "left",
      },
    ],
  };
}

function createSample(input: {
  eastMeters: number;
  northMeters: number;
  headingDegrees: number;
  timestampMs: number;
  speedMetersPerSecond?: number;
}): PositionSample {
  return {
    ...moveCoordinateByMeters(ORIGIN, input.eastMeters, input.northMeters),
    headingDegrees: input.headingDegrees,
    speedMetersPerSecond: input.speedMetersPerSecond ?? 1.4,
    timestampMs: input.timestampMs,
  };
}

describe("RouteDeviationEngine", () => {
  it("returns on_route for normal walking samples", () => {
    const engine = new RouteDeviationEngine(buildStraightRoute());

    const result = engine.processSample(
      createSample({
        eastMeters: 15,
        northMeters: 0,
        headingDegrees: 90,
        timestampMs: 1_000,
      })
    );

    expect(result.state).toBe("on_route");
    expect(result.suggestedNextAction).toBe("none");
    expect(result.reasons).toContain("within_route_corridor");
  });

  it("returns drifting for mild off-route movement", () => {
    const engine = new RouteDeviationEngine(buildStraightRoute());

    const result = engine.processSample(
      createSample({
        eastMeters: 20,
        northMeters: 11,
        headingDegrees: 90,
        timestampMs: 1_000,
      })
    );

    expect(result.state).toBe("drifting");
    expect(result.suggestedNextAction).toBe("monitor");
    expect(result.reasons).toContain("distance_over_drift_threshold");
  });

  it("returns deviated after sustained off-route movement", () => {
    const engine = new RouteDeviationEngine(buildStraightRoute());

    engine.processSample(
      createSample({
        eastMeters: 20,
        northMeters: 18,
        headingDegrees: 0,
        timestampMs: 1_000,
      })
    );
    engine.processSample(
      createSample({
        eastMeters: 25,
        northMeters: 18,
        headingDegrees: 0,
        timestampMs: 3_000,
      })
    );
    const result = engine.processSample(
      createSample({
        eastMeters: 30,
        northMeters: 18,
        headingDegrees: 0,
        timestampMs: 5_000,
      })
    );

    expect(result.state).toBe("deviated");
    expect(result.suggestedNextAction).toBe("warn_user");
    expect(result.reasons).toContain("persistent_threshold_breach");
    expect(result.reasons).toContain("sustained_drift_duration");
  });

  it("returns passed_turn when the user misses a turn after entering the approach zone", () => {
    const engine = new RouteDeviationEngine(buildLeftTurnRoute());

    engine.processSample(
      createSample({
        eastMeters: 32,
        northMeters: 0,
        headingDegrees: 90,
        timestampMs: 1_000,
      })
    );

    const result = engine.processSample(
      createSample({
        eastMeters: 52,
        northMeters: 0,
        headingDegrees: 90,
        timestampMs: 2_000,
      })
    );

    expect(result.state).toBe("passed_turn");
    expect(result.suggestedNextAction).toBe("reroute_candidate");
    expect(result.reasons).toContain("missed_expected_turn");
    expect(result.metrics.distancePastTurnPointMeters).toBeGreaterThanOrEqual(
      DEFAULT_WALKING_ENGINE_CONFIG.passByPostTurnDistanceThresholdMeters
    );
  });

  it("does not flag passed_turn when the user makes the expected turn", () => {
    const engine = new RouteDeviationEngine(buildLeftTurnRoute());

    engine.processSample(
      createSample({
        eastMeters: 32,
        northMeters: 0,
        headingDegrees: 90,
        timestampMs: 1_000,
      })
    );

    const result = engine.processSample(
      createSample({
        eastMeters: 40,
        northMeters: 12,
        headingDegrees: 0,
        timestampMs: 2_000,
      })
    );

    expect(result.state).toBe("on_route");
    expect(result.state).not.toBe("passed_turn");
  });

  it("treats a single noisy GPS spike as non-deviated and recovers on the next on-route sample", () => {
    const engine = new RouteDeviationEngine(buildStraightRoute());

    const firstResult = engine.processSample(
      createSample({
        eastMeters: 10,
        northMeters: 0,
        headingDegrees: 90,
        timestampMs: 1_000,
      })
    );
    const noisyResult = engine.processSample(
      createSample({
        eastMeters: 15,
        northMeters: 18,
        headingDegrees: 0,
        timestampMs: 2_000,
      })
    );
    const recoveredResult = engine.processSample(
      createSample({
        eastMeters: 20,
        northMeters: 0,
        headingDegrees: 90,
        timestampMs: 3_000,
      })
    );

    expect(firstResult.state).toBe("on_route");
    expect(noisyResult.state).toBe("drifting");
    expect(recoveredResult.state).toBe("on_route");
    expect(recoveredResult.metrics.consecutiveThresholdBreaches).toBe(0);
  });

  it("resets drift counters after the user returns to the route", () => {
    const engine = new RouteDeviationEngine(buildStraightRoute());

    engine.processSample(
      createSample({
        eastMeters: 20,
        northMeters: 18,
        headingDegrees: 0,
        timestampMs: 1_000,
      })
    );
    engine.processSample(
      createSample({
        eastMeters: 25,
        northMeters: 0,
        headingDegrees: 90,
        timestampMs: 2_000,
      })
    );
    engine.processSample(
      createSample({
        eastMeters: 30,
        northMeters: 18,
        headingDegrees: 0,
        timestampMs: 3_000,
      })
    );

    expect(engine.getSessionState().consecutiveThresholdBreaches).toBe(1);
    expect(engine.getSessionState().driftStartTimestampMs).toBe(3_000);
  });

  it("clears passed_turn when user backtracks to before the turn point", () => {
    const engine = new RouteDeviationEngine(buildLeftTurnRoute());

    engine.processSample(
      createSample({
        eastMeters: 32,
        northMeters: 0,
        headingDegrees: 90,
        timestampMs: 1_000,
      })
    );

    const missedResult = engine.processSample(
      createSample({
        eastMeters: 52,
        northMeters: 0,
        headingDegrees: 90,
        timestampMs: 2_000,
      })
    );
    expect(missedResult.state).toBe("passed_turn");

    const recoveredResult = engine.processSample(
      createSample({
        eastMeters: 20,
        northMeters: 0,
        headingDegrees: 270,
        timestampMs: 3_000,
      })
    );
    expect(recoveredResult.state).toBe("on_route");
    expect(recoveredResult.metrics.turnApproachActive).toBe(false);
  });

  it("applies config overrides for tighter deviation sensitivity", () => {
    const engine = new RouteDeviationEngine(buildStraightRoute(), {
      routeDeviationDistanceThresholdMeters: 12,
      minimumConsecutiveSamplesForDeviation: 2,
      minimumDriftDurationMs: 1_000,
    });

    engine.processSample(
      createSample({
        eastMeters: 20,
        northMeters: 13,
        headingDegrees: 0,
        timestampMs: 1_000,
      })
    );
    const result = engine.processSample(
      createSample({
        eastMeters: 25,
        northMeters: 13,
        headingDegrees: 0,
        timestampMs: 2_000,
      })
    );

    expect(result.state).toBe("deviated");
    expect(result.metrics.consecutiveThresholdBreaches).toBe(2);
  });
});

describe("RouteDeviationEngine — invalid route inputs", () => {
  it("throws RangeError when polyline is empty", () => {
    expect(() => {
      new RouteDeviationEngine({ polyline: [], turnPoints: [] });
    }).toThrow(RangeError);
  });

  it("throws RangeError when polyline has only one coordinate", () => {
    expect(() => {
      new RouteDeviationEngine({ polyline: [ORIGIN], turnPoints: [] });
    }).toThrow(RangeError);
  });

  it("error message mentions coordinate requirement", () => {
    expect(() => {
      new RouteDeviationEngine({ polyline: [], turnPoints: [] });
    }).toThrow(/at least two/);
  });
});
