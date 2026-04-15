import { describe, expect, it } from "vitest";

import {
  angularDifference,
  bearingDegrees,
  distanceMeters,
  moveCoordinateByMeters,
  normalizeHeading,
  pointToPolylineDistanceMeters,
  pointToSegmentDistanceMeters,
} from "../src/geometry/index.js";
import type { Coordinate } from "../src/types/index.js";

const ORIGIN: Coordinate = {
  latitude: 37.5665,
  longitude: 126.978,
};

describe("geometry utilities", () => {
  it("calculates haversine distance in meters", () => {
    const northOfOrigin = moveCoordinateByMeters(ORIGIN, 0, 100);

    expect(distanceMeters(ORIGIN, northOfOrigin)).toBeGreaterThan(99);
    expect(distanceMeters(ORIGIN, northOfOrigin)).toBeLessThan(101);
  });

  it("calculates bearings in walking directions", () => {
    const eastOfOrigin = moveCoordinateByMeters(ORIGIN, 40, 0);
    const northOfOrigin = moveCoordinateByMeters(ORIGIN, 0, 40);

    expect(bearingDegrees(ORIGIN, eastOfOrigin)).toBeCloseTo(90, 0);
    expect(bearingDegrees(ORIGIN, northOfOrigin)).toBeCloseTo(0, 0);
  });

  it("normalizes headings to the 0-360 range", () => {
    expect(normalizeHeading(-30)).toBe(330);
    expect(normalizeHeading(725)).toBe(5);
  });

  it("returns angular difference between 0 and 180 degrees", () => {
    expect(angularDifference(10, 350)).toBe(20);
    expect(angularDifference(90, 270)).toBe(180);
    expect(angularDifference(-30, 30)).toBe(60);
  });

  it("calculates point to segment distance for short walking segments", () => {
    const segmentStart = ORIGIN;
    const segmentEnd = moveCoordinateByMeters(segmentStart, 50, 0);
    const sample = moveCoordinateByMeters(segmentStart, 25, 12);

    expect(pointToSegmentDistanceMeters(sample, segmentStart, segmentEnd)).toBeCloseTo(12, 0);
  });

  it("calculates shortest point to polyline distance across segments", () => {
    const route = [
      ORIGIN,
      moveCoordinateByMeters(ORIGIN, 50, 0),
      moveCoordinateByMeters(ORIGIN, 50, 50),
    ] as const;
    const sample = moveCoordinateByMeters(ORIGIN, 60, 25);

    expect(pointToPolylineDistanceMeters(sample, route)).toBeCloseTo(10, 0);
  });
});
