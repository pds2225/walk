import type { EngineConfig } from "../types/index.js";

export const DEFAULT_WALKING_ENGINE_CONFIG: EngineConfig = Object.freeze({
  routeDriftDistanceThresholdMeters: 10,
  routeDeviationDistanceThresholdMeters: 15,
  strongDeviationDistanceThresholdMeters: 25,
  headingDifferenceThresholdDegrees: 45,
  passByPostTurnDistanceThresholdMeters: 8,
  turnApproachDistanceThresholdMeters: 12,
  minimumConsecutiveSamplesForDeviation: 3,
  minimumDriftDurationMs: 4_000,
  headingConflictMinimumSpeedMps: 0.7,
  driftExitHysteresisRatio: 0.8,
});

function assertPositiveNumber(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

/** 0 은 '속도 게이트 끄기'라는 의미라 허용한다. */
function assertNonNegativeNumber(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

export function validateEngineConfig(config: EngineConfig): EngineConfig {
  assertPositiveNumber(
    "routeDriftDistanceThresholdMeters",
    config.routeDriftDistanceThresholdMeters
  );
  assertPositiveNumber(
    "routeDeviationDistanceThresholdMeters",
    config.routeDeviationDistanceThresholdMeters
  );
  assertPositiveNumber(
    "strongDeviationDistanceThresholdMeters",
    config.strongDeviationDistanceThresholdMeters
  );
  assertPositiveNumber(
    "headingDifferenceThresholdDegrees",
    config.headingDifferenceThresholdDegrees
  );
  assertPositiveNumber(
    "passByPostTurnDistanceThresholdMeters",
    config.passByPostTurnDistanceThresholdMeters
  );
  assertPositiveNumber(
    "turnApproachDistanceThresholdMeters",
    config.turnApproachDistanceThresholdMeters
  );
  assertPositiveNumber(
    "minimumConsecutiveSamplesForDeviation",
    config.minimumConsecutiveSamplesForDeviation
  );
  assertPositiveNumber("minimumDriftDurationMs", config.minimumDriftDurationMs);
  assertNonNegativeNumber(
    "headingConflictMinimumSpeedMps",
    config.headingConflictMinimumSpeedMps
  );
  assertPositiveNumber(
    "driftExitHysteresisRatio",
    config.driftExitHysteresisRatio
  );

  if (
    config.routeDeviationDistanceThresholdMeters <
    config.routeDriftDistanceThresholdMeters
  ) {
    throw new RangeError(
      "routeDeviationDistanceThresholdMeters must be greater than or equal to routeDriftDistanceThresholdMeters."
    );
  }

  if (
    config.strongDeviationDistanceThresholdMeters <
    config.routeDeviationDistanceThresholdMeters
  ) {
    throw new RangeError(
      "strongDeviationDistanceThresholdMeters must be greater than or equal to routeDeviationDistanceThresholdMeters."
    );
  }

  return config;
}

export function createEngineConfig(
  overrides: Partial<EngineConfig> = {}
): EngineConfig {
  return validateEngineConfig({
    ...DEFAULT_WALKING_ENGINE_CONFIG,
    ...overrides,
  });
}
