import type { Coordinate, RoutePolyline } from "../types/index.js";

const EARTH_RADIUS_METERS = 6_371_000;

interface LocalPoint {
  readonly eastMeters: number;
  readonly northMeters: number;
}

export interface SegmentProjection {
  readonly distanceMeters: number;
  readonly projectedCoordinate: Coordinate;
  readonly projectionRatio: number;
}

export interface PolylineProjection extends SegmentProjection {
  readonly segmentIndex: number;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function projectToLocalMeters(origin: Coordinate, coordinate: Coordinate): LocalPoint {
  const latitudeDeltaRadians = toRadians(coordinate.latitude - origin.latitude);
  const longitudeDeltaRadians = toRadians(coordinate.longitude - origin.longitude);
  const meanLatitudeRadians = toRadians((origin.latitude + coordinate.latitude) / 2);

  return {
    eastMeters: longitudeDeltaRadians * EARTH_RADIUS_METERS * Math.cos(meanLatitudeRadians),
    northMeters: latitudeDeltaRadians * EARTH_RADIUS_METERS,
  };
}

function projectFromLocalMeters(origin: Coordinate, point: LocalPoint): Coordinate {
  const latitude = origin.latitude + toDegrees(point.northMeters / EARTH_RADIUS_METERS);
  const metersPerDegreeLongitude =
    EARTH_RADIUS_METERS * Math.cos(toRadians(origin.latitude));

  const longitude =
    origin.longitude +
    toDegrees(point.eastMeters / metersPerDegreeLongitude);

  return { latitude, longitude };
}

export function distanceMeters(start: Coordinate, end: Coordinate): number {
  const startLatitudeRadians = toRadians(start.latitude);
  const endLatitudeRadians = toRadians(end.latitude);
  const latitudeDeltaRadians = toRadians(end.latitude - start.latitude);
  const longitudeDeltaRadians = toRadians(end.longitude - start.longitude);

  const haversineComponent =
    Math.sin(latitudeDeltaRadians / 2) ** 2 +
    Math.cos(startLatitudeRadians) *
      Math.cos(endLatitudeRadians) *
      Math.sin(longitudeDeltaRadians / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversineComponent));
}

export function bearingDegrees(start: Coordinate, end: Coordinate): number {
  const startLatitudeRadians = toRadians(start.latitude);
  const endLatitudeRadians = toRadians(end.latitude);
  const longitudeDeltaRadians = toRadians(end.longitude - start.longitude);

  const y = Math.sin(longitudeDeltaRadians) * Math.cos(endLatitudeRadians);
  const x =
    Math.cos(startLatitudeRadians) * Math.sin(endLatitudeRadians) -
    Math.sin(startLatitudeRadians) *
      Math.cos(endLatitudeRadians) *
      Math.cos(longitudeDeltaRadians);

  return normalizeHeading(toDegrees(Math.atan2(y, x)));
}

export function normalizeHeading(headingDegrees: number): number {
  const normalizedHeading = headingDegrees % 360;

  if (normalizedHeading < 0) {
    return normalizedHeading + 360;
  }

  return normalizedHeading;
}

export function angularDifference(
  firstHeadingDegrees: number,
  secondHeadingDegrees: number
): number {
  const difference = Math.abs(
    normalizeHeading(firstHeadingDegrees) - normalizeHeading(secondHeadingDegrees)
  );

  return difference > 180 ? 360 - difference : difference;
}

export function projectPointToSegmentMeters(
  point: Coordinate,
  segmentStart: Coordinate,
  segmentEnd: Coordinate
): SegmentProjection {
  const pointLocal = projectToLocalMeters(segmentStart, point);
  const endLocal = projectToLocalMeters(segmentStart, segmentEnd);
  const segmentLengthSquared =
    endLocal.eastMeters ** 2 + endLocal.northMeters ** 2;

  if (segmentLengthSquared === 0) {
    return {
      distanceMeters: distanceMeters(point, segmentStart),
      projectedCoordinate: segmentStart,
      projectionRatio: 0,
    };
  }

  const rawProjectionRatio =
    (pointLocal.eastMeters * endLocal.eastMeters +
      pointLocal.northMeters * endLocal.northMeters) /
    segmentLengthSquared;
  const projectionRatio = Math.max(0, Math.min(1, rawProjectionRatio));

  const projectedPoint: LocalPoint = {
    eastMeters: endLocal.eastMeters * projectionRatio,
    northMeters: endLocal.northMeters * projectionRatio,
  };

  const deltaEastMeters = pointLocal.eastMeters - projectedPoint.eastMeters;
  const deltaNorthMeters = pointLocal.northMeters - projectedPoint.northMeters;

  return {
    distanceMeters: Math.hypot(deltaEastMeters, deltaNorthMeters),
    projectedCoordinate: projectFromLocalMeters(segmentStart, projectedPoint),
    projectionRatio,
  };
}

export function pointToSegmentDistanceMeters(
  point: Coordinate,
  segmentStart: Coordinate,
  segmentEnd: Coordinate
): number {
  return projectPointToSegmentMeters(point, segmentStart, segmentEnd).distanceMeters;
}

export function projectPointToPolylineMeters(
  point: Coordinate,
  polyline: RoutePolyline
): PolylineProjection {
  if (polyline.length < 2) {
    throw new RangeError("Route polyline must contain at least two coordinates.");
  }

  let bestProjection: PolylineProjection | undefined;

  for (let segmentIndex = 0; segmentIndex < polyline.length - 1; segmentIndex += 1) {
    const segmentStart = polyline[segmentIndex];
    const segmentEnd = polyline[segmentIndex + 1];

    if (!segmentStart || !segmentEnd) {
      throw new RangeError("Route polyline contains an invalid segment.");
    }

    const projection = projectPointToSegmentMeters(point, segmentStart, segmentEnd);

    if (!bestProjection || projection.distanceMeters < bestProjection.distanceMeters) {
      bestProjection = {
        ...projection,
        segmentIndex,
      };
    }
  }

  if (!bestProjection) {
    throw new RangeError("Unable to project point onto polyline.");
  }

  return bestProjection;
}

export function pointToPolylineDistanceMeters(
  point: Coordinate,
  polyline: RoutePolyline
): number {
  return projectPointToPolylineMeters(point, polyline).distanceMeters;
}

export function moveCoordinateByMeters(
  origin: Coordinate,
  eastMeters: number,
  northMeters: number
): Coordinate {
  return projectFromLocalMeters(origin, { eastMeters, northMeters });
}

export function distanceAlongHeadingMeters(
  origin: Coordinate,
  headingDegrees: number,
  point: Coordinate
): number {
  const localPoint = projectToLocalMeters(origin, point);
  const normalizedHeadingRadians = toRadians(normalizeHeading(headingDegrees));
  const headingVectorEast = Math.sin(normalizedHeadingRadians);
  const headingVectorNorth = Math.cos(normalizedHeadingRadians);

  return (
    localPoint.eastMeters * headingVectorEast +
    localPoint.northMeters * headingVectorNorth
  );
}
