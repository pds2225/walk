import { describe, expect, it } from "vitest";

import {
  deriveSegmentHeadings,
  findNearestRouteSegment,
  getDistancePastTurnPointMeters,
  getDistanceToTurnPointMeters,
  getExpectedHeadingForSegment,
  getNextTurnPoint,
  getTurnRelativePosition,
  prepareRouteModel,
} from "../src/domain/index.js";
import { moveCoordinateByMeters } from "../src/geometry/index.js";
import type { PositionSample, RouteModel } from "../src/types/index.js";

const route: RouteModel = {
  polyline: [
    { latitude: 37.5665, longitude: 126.978 },
    moveCoordinateByMeters({ latitude: 37.5665, longitude: 126.978 }, 40, 0),
    moveCoordinateByMeters({ latitude: 37.5665, longitude: 126.978 }, 40, 40),
  ],
  turnPoints: [
    {
      id: "turn-left-1",
      coordinate: moveCoordinateByMeters({ latitude: 37.5665, longitude: 126.978 }, 40, 0),
      routeIndex: 1,
      direction: "left",
    },
  ],
};

describe("route analysis helpers", () => {
  it("derives segment headings from a route polyline", () => {
    const headings = deriveSegmentHeadings(route.polyline);

    expect(headings[0]).toBeCloseTo(90, 0);
    expect(headings[1]).toBeCloseTo(0, 0);
  });

  it("finds the nearest route segment for a sample", () => {
    const preparedRoute = prepareRouteModel(route);
    const sample = moveCoordinateByMeters(route.polyline[1]!, 8, 20);
    const nearestSegment = findNearestRouteSegment(preparedRoute, sample);

    expect(nearestSegment.segmentIndex).toBe(1);
    expect(nearestSegment.distanceMeters).toBeCloseTo(8, 0);
  });

  it("returns the next turn point and route distance to it", () => {
    const preparedRoute = prepareRouteModel(route);
    const sample = moveCoordinateByMeters(route.polyline[0]!, 25, 0);
    const nearestSegment = findNearestRouteSegment(preparedRoute, sample);
    const nextTurnContext = getNextTurnPoint(
      preparedRoute,
      nearestSegment.distanceAlongRouteMeters
    );

    expect(nextTurnContext?.turnPoint.id).toBe("turn-left-1");
    expect(nextTurnContext?.distanceToTurnPointMeters).toBeCloseTo(15, 0);
    expect(nextTurnContext?.relativePosition).toBe("before");
  });

  it("classifies a sample as after a turn once it goes beyond the route index", () => {
    const preparedRoute = prepareRouteModel(route);
    const sample = moveCoordinateByMeters(route.polyline[1]!, 0, 12);
    const nearestSegment = findNearestRouteSegment(preparedRoute, sample);
    const turnPoint = preparedRoute.turnPoints[0];

    expect(turnPoint).toBeDefined();
    expect(getTurnRelativePosition(nearestSegment.distanceAlongRouteMeters, turnPoint!)).toBe(
      "after"
    );
    expect(
      getDistanceToTurnPointMeters(nearestSegment.distanceAlongRouteMeters, turnPoint!)
    ).toBeCloseTo(12, 0);
  });

  it("returns the expected heading for the current route segment", () => {
    const preparedRoute = prepareRouteModel(route);

    expect(getExpectedHeadingForSegment(preparedRoute, 0)).toBeCloseTo(90, 0);
    expect(getExpectedHeadingForSegment(preparedRoute, 1)).toBeCloseTo(0, 0);
  });

  it("measures how far the user moved past a turn in the approach direction", () => {
    const preparedRoute = prepareRouteModel(route);
    const turnPoint = preparedRoute.turnPoints[0];
    const missedTurnSample: PositionSample = {
      ...moveCoordinateByMeters(turnPoint!.coordinate, 12, 0),
      headingDegrees: 90,
      speedMetersPerSecond: 1.4,
      timestampMs: 1_000,
    };

    expect(getDistancePastTurnPointMeters(turnPoint!, missedTurnSample)).toBeCloseTo(12, 0);
  });
});
