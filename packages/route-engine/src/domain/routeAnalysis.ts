import {
  bearingDegrees,
  distanceAlongHeadingMeters,
  distanceMeters,
  projectPointToPolylineMeters,
} from "../geometry/index.js";
import type { Coordinate, PositionSample, RouteModel, RoutePolyline, TurnPoint } from "../types/index.js";

export interface PreparedTurnPoint extends TurnPoint {
  readonly approachHeadingDegrees: number;
  readonly exitHeadingDegrees: number;
  readonly distanceAlongRouteMeters: number;
}

export interface PreparedRoute {
  readonly route: RouteModel;
  readonly segmentHeadings: readonly number[];
  readonly segmentLengthsMeters: readonly number[];
  readonly cumulativeDistancesMeters: readonly number[];
  readonly turnPoints: readonly PreparedTurnPoint[];
}

export interface NearestRouteSegment {
  readonly segmentIndex: number;
  readonly distanceMeters: number;
  readonly projectedCoordinate: Coordinate;
  readonly projectionRatio: number;
  readonly distanceAlongRouteMeters: number;
}

export type TurnRelativePosition = "before" | "at" | "after";

export interface NextTurnContext {
  readonly turnPoint: PreparedTurnPoint;
  readonly distanceToTurnPointMeters: number;
  readonly relativePosition: TurnRelativePosition;
}

function assertValidPolyline(polyline: RoutePolyline): void {
  if (polyline.length < 2) {
    throw new RangeError("Route polyline must contain at least two coordinates.");
  }
}

function deriveSegmentLengths(polyline: RoutePolyline): number[] {
  assertValidPolyline(polyline);

  const segmentLengths: number[] = [];

  for (let segmentIndex = 0; segmentIndex < polyline.length - 1; segmentIndex += 1) {
    const segmentStart = polyline[segmentIndex];
    const segmentEnd = polyline[segmentIndex + 1];

    if (!segmentStart || !segmentEnd) {
      throw new RangeError("Route polyline contains an invalid segment.");
    }

    segmentLengths.push(distanceMeters(segmentStart, segmentEnd));
  }

  return segmentLengths;
}

function deriveCumulativeDistances(segmentLengths: readonly number[]): number[] {
  const cumulativeDistances = [0];

  for (const segmentLength of segmentLengths) {
    const previousDistance = cumulativeDistances[cumulativeDistances.length - 1];

    if (previousDistance === undefined) {
      throw new RangeError("Unable to derive cumulative route distance.");
    }

    cumulativeDistances.push(previousDistance + segmentLength);
  }

  return cumulativeDistances;
}

function validateTurnPoint(polyline: RoutePolyline, turnPoint: TurnPoint): void {
  if (turnPoint.routeIndex <= 0 || turnPoint.routeIndex >= polyline.length - 1) {
    throw new RangeError(
      `Turn point "${turnPoint.id}" must reference a route index with both approach and exit segments.`
    );
  }
}

export function deriveSegmentHeadings(polyline: RoutePolyline): number[] {
  assertValidPolyline(polyline);

  const segmentHeadings: number[] = [];

  for (let segmentIndex = 0; segmentIndex < polyline.length - 1; segmentIndex += 1) {
    const segmentStart = polyline[segmentIndex];
    const segmentEnd = polyline[segmentIndex + 1];

    if (!segmentStart || !segmentEnd) {
      throw new RangeError("Route polyline contains an invalid segment.");
    }

    segmentHeadings.push(bearingDegrees(segmentStart, segmentEnd));
  }

  return segmentHeadings;
}

export function prepareRouteModel(route: RouteModel): PreparedRoute {
  assertValidPolyline(route.polyline);

  const segmentHeadings = deriveSegmentHeadings(route.polyline);
  const segmentLengthsMeters = deriveSegmentLengths(route.polyline);
  const cumulativeDistancesMeters = deriveCumulativeDistances(segmentLengthsMeters);
  const turnPoints = [...route.turnPoints]
    .sort((firstTurnPoint, secondTurnPoint) => firstTurnPoint.routeIndex - secondTurnPoint.routeIndex)
    .map<PreparedTurnPoint>((turnPoint) => {
      validateTurnPoint(route.polyline, turnPoint);

      const approachHeadingDegrees = segmentHeadings[turnPoint.routeIndex - 1];
      const exitHeadingDegrees = segmentHeadings[turnPoint.routeIndex];
      const distanceAlongRouteMeters = cumulativeDistancesMeters[turnPoint.routeIndex];

      if (
        approachHeadingDegrees === undefined ||
        exitHeadingDegrees === undefined ||
        distanceAlongRouteMeters === undefined
      ) {
        throw new RangeError(`Turn point "${turnPoint.id}" could not be prepared.`);
      }

      return {
        ...turnPoint,
        approachHeadingDegrees,
        exitHeadingDegrees,
        distanceAlongRouteMeters,
      };
    });

  return {
    route,
    segmentHeadings,
    segmentLengthsMeters,
    cumulativeDistancesMeters,
    turnPoints,
  };
}

export function findNearestRouteSegment(
  preparedRoute: PreparedRoute,
  sample: Coordinate
): NearestRouteSegment {
  const projection = projectPointToPolylineMeters(sample, preparedRoute.route.polyline);
  const segmentDistanceStart =
    preparedRoute.cumulativeDistancesMeters[projection.segmentIndex];
  const segmentLengthMeters =
    preparedRoute.segmentLengthsMeters[projection.segmentIndex];

  if (segmentDistanceStart === undefined || segmentLengthMeters === undefined) {
    throw new RangeError("Unable to determine nearest route segment.");
  }

  return {
    ...projection,
    distanceAlongRouteMeters:
      segmentDistanceStart + segmentLengthMeters * projection.projectionRatio,
  };
}

export function findNearestTurnPoint(
  preparedRoute: PreparedRoute,
  sample: Coordinate
): PreparedTurnPoint | undefined {
  let nearestTurnPoint: PreparedTurnPoint | undefined;
  let nearestDistanceMeters = Number.POSITIVE_INFINITY;

  for (const turnPoint of preparedRoute.turnPoints) {
    const turnDistanceMeters = distanceMeters(sample, turnPoint.coordinate);

    if (turnDistanceMeters < nearestDistanceMeters) {
      nearestTurnPoint = turnPoint;
      nearestDistanceMeters = turnDistanceMeters;
    }
  }

  return nearestTurnPoint;
}

export function getTurnRelativePosition(
  currentDistanceAlongRouteMeters: number,
  turnPoint: PreparedTurnPoint,
  toleranceMeters = 3
): TurnRelativePosition {
  const signedDistanceToTurnMeters =
    turnPoint.distanceAlongRouteMeters - currentDistanceAlongRouteMeters;

  if (Math.abs(signedDistanceToTurnMeters) <= toleranceMeters) {
    return "at";
  }

  return signedDistanceToTurnMeters > 0 ? "before" : "after";
}

export function getNextTurnPoint(
  preparedRoute: PreparedRoute,
  currentDistanceAlongRouteMeters: number
): NextTurnContext | undefined {
  for (const turnPoint of preparedRoute.turnPoints) {
    const relativePosition = getTurnRelativePosition(currentDistanceAlongRouteMeters, turnPoint);

    if (relativePosition === "before" || relativePosition === "at") {
      return {
        turnPoint,
        distanceToTurnPointMeters: Math.max(
          0,
          turnPoint.distanceAlongRouteMeters - currentDistanceAlongRouteMeters
        ),
        relativePosition,
      };
    }
  }

  return undefined;
}

export function getDistanceToTurnPointMeters(
  currentDistanceAlongRouteMeters: number,
  turnPoint: PreparedTurnPoint
): number {
  return Math.abs(turnPoint.distanceAlongRouteMeters - currentDistanceAlongRouteMeters);
}

export function getExpectedHeadingForSegment(
  preparedRoute: PreparedRoute,
  segmentIndex: number
): number {
  const expectedHeadingDegrees = preparedRoute.segmentHeadings[segmentIndex];

  if (expectedHeadingDegrees === undefined) {
    throw new RangeError(`No segment heading exists for segment index ${segmentIndex}.`);
  }

  return expectedHeadingDegrees;
}

export function getDistancePastTurnPointMeters(
  turnPoint: PreparedTurnPoint,
  sample: PositionSample
): number {
  return Math.max(
    0,
    distanceAlongHeadingMeters(turnPoint.coordinate, turnPoint.approachHeadingDegrees, sample)
  );
}
