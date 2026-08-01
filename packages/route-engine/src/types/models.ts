export interface Coordinate {
  readonly latitude: number;
  readonly longitude: number;
}

export interface PositionSample extends Coordinate {
  readonly headingDegrees: number;
  readonly speedMetersPerSecond: number;
  readonly timestampMs: number;
}

export type TurnDirection = "left" | "right" | "straight";

export interface TurnPoint {
  readonly id: string;
  readonly coordinate: Coordinate;
  readonly routeIndex: number;
  readonly direction: TurnDirection;
}

export type RoutePolyline = readonly Coordinate[];

export interface RouteModel {
  readonly polyline: RoutePolyline;
  readonly turnPoints: readonly TurnPoint[];
}

export type DeviationState = "on_route" | "drifting" | "deviated" | "passed_turn";

export type SuggestedAction = "none" | "monitor" | "warn_user" | "reroute_candidate";

export type DecisionReason =
  | "within_route_corridor"
  | "distance_over_drift_threshold"
  | "distance_over_deviation_threshold"
  | "strong_distance_breach"
  | "heading_conflicts_with_route"
  | "persistent_threshold_breach"
  | "sustained_drift_duration"
  | "entered_turn_approach_zone"
  | "missed_expected_turn"
  | "continued_past_turn_in_conflicting_direction";

export interface EngineConfig {
  readonly routeDriftDistanceThresholdMeters: number;
  readonly routeDeviationDistanceThresholdMeters: number;
  readonly strongDeviationDistanceThresholdMeters: number;
  readonly headingDifferenceThresholdDegrees: number;
  readonly passByPostTurnDistanceThresholdMeters: number;
  readonly turnApproachDistanceThresholdMeters: number;
  readonly minimumConsecutiveSamplesForDeviation: number;
  readonly minimumDriftDurationMs: number;
  /**
   * 이 속도 미만에서는 진행 방향을 신뢰하지 않는다. 제자리에서 서성이거나 직진길에서
   * 왔다갔다 할 때 heading 이 뒤집혀 이탈로 오판되는 것을 막는다.
   */
  readonly headingConflictMinimumSpeedMps: number;
}

export interface EngineMetrics {
  readonly distanceFromRouteMeters: number;
  readonly expectedHeadingDegrees: number;
  readonly headingDifferenceDegrees: number;
  readonly nearestSegmentIndex: number;
  readonly routeDistanceAlongMeters: number;
  readonly nearestTurnPointId?: string;
  readonly distanceToNextTurnPointMeters?: number;
  readonly distancePastTurnPointMeters?: number;
  readonly postTurnHeadingDifferenceDegrees?: number;
  readonly consecutiveThresholdBreaches: number;
  readonly driftDurationMs: number;
  readonly speedMetersPerSecond: number;
  readonly turnApproachActive: boolean;
}

export interface EngineResult {
  readonly state: DeviationState;
  readonly score: number;
  readonly reasons: readonly DecisionReason[];
  readonly metrics: EngineMetrics;
  readonly suggestedNextAction: SuggestedAction;
}

export interface EngineSessionState {
  readonly consecutiveThresholdBreaches: number;
  readonly driftStartTimestampMs?: number;
  readonly activeApproachTurnId?: string;
}
