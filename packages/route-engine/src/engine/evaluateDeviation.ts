import {
  findNearestRouteSegment,
  findNearestTurnPoint,
  getDistancePastTurnPointMeters,
  getExpectedHeadingForSegment,
  getNextTurnPoint,
} from "../domain/index.js";
import type { PreparedRoute, PreparedTurnPoint } from "../domain/index.js";
import { angularDifference } from "../geometry/index.js";
import type {
  DecisionReason,
  DeviationState,
  EngineConfig,
  EngineMetrics,
  EngineResult,
  EngineSessionState,
  PositionSample,
  SuggestedAction,
} from "../types/index.js";

export interface DeviationEvaluation {
  readonly result: EngineResult;
  readonly nextSessionState: EngineSessionState;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundScore(score: number): number {
  return Math.round(score * 1_000) / 1_000;
}

function createSessionState(
  consecutiveThresholdBreaches: number,
  driftStartTimestampMs: number | undefined,
  activeApproachTurnId: string | undefined
): EngineSessionState {
  return {
    consecutiveThresholdBreaches,
    ...(driftStartTimestampMs !== undefined ? { driftStartTimestampMs } : {}),
    ...(activeApproachTurnId !== undefined ? { activeApproachTurnId } : {}),
  };
}

function createMetrics(input: {
  distanceFromRouteMeters: number;
  expectedHeadingDegrees: number;
  headingDifferenceDegrees: number;
  nearestSegmentIndex: number;
  routeDistanceAlongMeters: number;
  nearestTurnPointId: string | undefined;
  distanceToNextTurnPointMeters: number | undefined;
  distancePastTurnPointMeters: number | undefined;
  postTurnHeadingDifferenceDegrees: number | undefined;
  consecutiveThresholdBreaches: number;
  driftDurationMs: number;
  speedMetersPerSecond: number;
  turnApproachActive: boolean;
}): EngineMetrics {
  return {
    distanceFromRouteMeters: input.distanceFromRouteMeters,
    expectedHeadingDegrees: input.expectedHeadingDegrees,
    headingDifferenceDegrees: input.headingDifferenceDegrees,
    nearestSegmentIndex: input.nearestSegmentIndex,
    routeDistanceAlongMeters: input.routeDistanceAlongMeters,
    consecutiveThresholdBreaches: input.consecutiveThresholdBreaches,
    driftDurationMs: input.driftDurationMs,
    speedMetersPerSecond: input.speedMetersPerSecond,
    turnApproachActive: input.turnApproachActive,
    ...(input.nearestTurnPointId !== undefined
      ? { nearestTurnPointId: input.nearestTurnPointId }
      : {}),
    ...(input.distanceToNextTurnPointMeters !== undefined
      ? { distanceToNextTurnPointMeters: input.distanceToNextTurnPointMeters }
      : {}),
    ...(input.distancePastTurnPointMeters !== undefined
      ? { distancePastTurnPointMeters: input.distancePastTurnPointMeters }
      : {}),
    ...(input.postTurnHeadingDifferenceDegrees !== undefined
      ? { postTurnHeadingDifferenceDegrees: input.postTurnHeadingDifferenceDegrees }
      : {}),
  };
}

function resolveSuggestedAction(
  state: DeviationState,
  strongDistanceBreach: boolean,
  score: number
): SuggestedAction {
  switch (state) {
    case "on_route":
      return "none";
    case "drifting":
      return "monitor";
    case "deviated":
      return strongDistanceBreach || score >= 0.85
        ? "reroute_candidate"
        : "warn_user";
    case "passed_turn":
      return "reroute_candidate";
    default: {
      const exhaustiveCheck: never = state;
      void exhaustiveCheck;
      throw new RangeError("Unexpected deviation state.");
    }
  }
}

function resolveActiveTurn(
  preparedRoute: PreparedRoute,
  activeApproachTurnId: string | undefined
): PreparedTurnPoint | undefined {
  if (activeApproachTurnId === undefined) {
    return undefined;
  }

  return preparedRoute.turnPoints.find((turnPoint) => turnPoint.id === activeApproachTurnId);
}

function computeScore(input: {
  config: EngineConfig;
  distanceFromRouteMeters: number;
  headingDifferenceDegrees: number;
  consecutiveThresholdBreaches: number;
  driftDurationMs: number;
}): number {
  const distanceScore = clamp(
    input.distanceFromRouteMeters / input.config.strongDeviationDistanceThresholdMeters,
    0,
    1
  );
  const headingScore = clamp(input.headingDifferenceDegrees / 180, 0, 1);
  const consecutiveScore = clamp(
    input.consecutiveThresholdBreaches /
      input.config.minimumConsecutiveSamplesForDeviation,
    0,
    1
  );
  const durationScore = clamp(
    input.driftDurationMs / input.config.minimumDriftDurationMs,
    0,
    1
  );

  return roundScore(
    0.45 * distanceScore +
      0.2 * headingScore +
      0.2 * consecutiveScore +
      0.15 * durationScore
  );
}

export function evaluateDeviationStep(input: {
  preparedRoute: PreparedRoute;
  sample: PositionSample;
  sessionState: EngineSessionState;
  config: EngineConfig;
}): DeviationEvaluation {
  const nearestSegment = findNearestRouteSegment(input.preparedRoute, input.sample);
  const expectedHeadingDegrees = getExpectedHeadingForSegment(
    input.preparedRoute,
    nearestSegment.segmentIndex
  );
  const headingDifferenceDegrees = angularDifference(
    input.sample.headingDegrees,
    expectedHeadingDegrees
  );
  const nearestTurnPoint = findNearestTurnPoint(input.preparedRoute, input.sample);
  const nextTurnContext = getNextTurnPoint(
    input.preparedRoute,
    nearestSegment.distanceAlongRouteMeters
  );

  let activeApproachTurnId = input.sessionState.activeApproachTurnId;
  let enteredTurnApproachZone = false;

  if (
    nextTurnContext &&
    nextTurnContext.distanceToTurnPointMeters <=
      input.config.turnApproachDistanceThresholdMeters
  ) {
    enteredTurnApproachZone =
      nextTurnContext.turnPoint.id !== input.sessionState.activeApproachTurnId;
    activeApproachTurnId = nextTurnContext.turnPoint.id;
  }

  const activeApproachTurn = resolveActiveTurn(
    input.preparedRoute,
    activeApproachTurnId
  );

  const driftDistanceBreach =
    nearestSegment.distanceMeters >= input.config.routeDriftDistanceThresholdMeters;
  const deviationDistanceBreach =
    nearestSegment.distanceMeters >=
    input.config.routeDeviationDistanceThresholdMeters;
  const strongDistanceBreach =
    nearestSegment.distanceMeters >=
    input.config.strongDeviationDistanceThresholdMeters;
  const headingConflict =
    headingDifferenceDegrees >= input.config.headingDifferenceThresholdDegrees;
  const thresholdBreach =
    driftDistanceBreach ||
    (headingConflict &&
      nearestSegment.distanceMeters >=
        input.config.routeDriftDistanceThresholdMeters * 0.6);

  const consecutiveThresholdBreaches = thresholdBreach
    ? input.sessionState.consecutiveThresholdBreaches + 1
    : 0;
  const driftStartTimestampMs = thresholdBreach
    ? input.sessionState.driftStartTimestampMs ?? input.sample.timestampMs
    : undefined;
  const driftDurationMs =
    thresholdBreach && driftStartTimestampMs !== undefined
      ? input.sample.timestampMs - driftStartTimestampMs
      : 0;

  let distancePastTurnPointMeters: number | undefined;
  let postTurnHeadingDifferenceDegrees: number | undefined;
  let passedTurn = false;

  if (activeApproachTurn) {
    postTurnHeadingDifferenceDegrees = angularDifference(
      input.sample.headingDegrees,
      activeApproachTurn.exitHeadingDegrees
    );

    const alignedWithExitHeading =
      postTurnHeadingDifferenceDegrees <
        input.config.headingDifferenceThresholdDegrees / 2 &&
      nearestSegment.distanceMeters <
        input.config.routeDriftDistanceThresholdMeters &&
      nearestSegment.segmentIndex >= activeApproachTurn.routeIndex;

    if (alignedWithExitHeading) {
      activeApproachTurnId = undefined;
      postTurnHeadingDifferenceDegrees = undefined;
    } else {
      distancePastTurnPointMeters = getDistancePastTurnPointMeters(
        activeApproachTurn,
        input.sample
      );

      const farEnoughPastTurn =
        distancePastTurnPointMeters >=
        input.config.passByPostTurnDistanceThresholdMeters;
      const conflictingAfterTurn =
        postTurnHeadingDifferenceDegrees >=
        input.config.headingDifferenceThresholdDegrees;
      const leftRouteAfterTurn =
        nearestSegment.distanceMeters >=
        input.config.routeDriftDistanceThresholdMeters * 0.7;

      passedTurn =
        farEnoughPastTurn && conflictingAfterTurn && leftRouteAfterTurn;
    }
  }

  const persistentThresholdBreach =
    consecutiveThresholdBreaches >=
    input.config.minimumConsecutiveSamplesForDeviation;
  const sustainedDriftDuration =
    driftDurationMs >= input.config.minimumDriftDurationMs;
  const deviated =
    !passedTurn &&
    (persistentThresholdBreach || sustainedDriftDuration) &&
    (deviationDistanceBreach || strongDistanceBreach || (driftDistanceBreach && headingConflict));
  const drifting = !passedTurn && !deviated && thresholdBreach;

  let state: DeviationState = "on_route";

  if (passedTurn) {
    state = "passed_turn";
  } else if (deviated) {
    state = "deviated";
  } else if (drifting) {
    state = "drifting";
  }

  const reasons: DecisionReason[] = [];

  if (state === "on_route") {
    reasons.push("within_route_corridor");
  } else {
    if (driftDistanceBreach) {
      reasons.push("distance_over_drift_threshold");
    }

    if (deviationDistanceBreach) {
      reasons.push("distance_over_deviation_threshold");
    }

    if (strongDistanceBreach) {
      reasons.push("strong_distance_breach");
    }

    if (headingConflict) {
      reasons.push("heading_conflicts_with_route");
    }

    if (persistentThresholdBreach) {
      reasons.push("persistent_threshold_breach");
    }

    if (sustainedDriftDuration) {
      reasons.push("sustained_drift_duration");
    }
  }

  if (enteredTurnApproachZone || activeApproachTurnId !== undefined) {
    reasons.push("entered_turn_approach_zone");
  }

  if (passedTurn) {
    reasons.push(
      "missed_expected_turn",
      "continued_past_turn_in_conflicting_direction"
    );
  }

  let score = computeScore({
    config: input.config,
    distanceFromRouteMeters: nearestSegment.distanceMeters,
    headingDifferenceDegrees,
    consecutiveThresholdBreaches,
    driftDurationMs,
  });

  if (passedTurn) {
    score = Math.max(score, 0.95);
  } else if (deviated) {
    score = Math.max(score, 0.75);
  } else if (drifting) {
    score = Math.max(score, 0.4);
  } else {
    score = Math.min(score, 0.25);
  }

  const suggestedNextAction = resolveSuggestedAction(
    state,
    strongDistanceBreach,
    score
  );

  const metrics = createMetrics({
    distanceFromRouteMeters: nearestSegment.distanceMeters,
    expectedHeadingDegrees,
    headingDifferenceDegrees,
    nearestSegmentIndex: nearestSegment.segmentIndex,
    routeDistanceAlongMeters: nearestSegment.distanceAlongRouteMeters,
    nearestTurnPointId: nextTurnContext?.turnPoint.id ?? nearestTurnPoint?.id,
    distanceToNextTurnPointMeters: nextTurnContext?.distanceToTurnPointMeters,
    distancePastTurnPointMeters,
    postTurnHeadingDifferenceDegrees,
    consecutiveThresholdBreaches,
    driftDurationMs,
    speedMetersPerSecond: input.sample.speedMetersPerSecond,
    turnApproachActive: activeApproachTurnId !== undefined,
  });

  return {
    result: {
      state,
      score: roundScore(score),
      reasons,
      metrics,
      suggestedNextAction,
    },
    nextSessionState: createSessionState(
      consecutiveThresholdBreaches,
      driftStartTimestampMs,
      activeApproachTurnId
    ),
  };
}
