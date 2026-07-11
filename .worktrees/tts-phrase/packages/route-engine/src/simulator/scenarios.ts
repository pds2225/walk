import { moveCoordinateByMeters } from "../geometry/index.js";
import type { Coordinate, PositionSample, RouteModel } from "../types/index.js";

const ORIGIN: Coordinate = {
  latitude: 37.5665,
  longitude: 126.978,
};

export interface SimulationScenario {
  readonly name: string;
  readonly description: string;
  readonly route: RouteModel;
  readonly samples: readonly PositionSample[];
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

export function createSimulationScenarios(): readonly SimulationScenario[] {
  return [
    {
      name: "normal walking",
      description: "Aligned with the route and heading east as expected.",
      route: buildStraightRoute(),
      samples: [
        createSample({
          eastMeters: 8,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 0,
        }),
        createSample({
          eastMeters: 16,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 2_000,
        }),
        createSample({
          eastMeters: 24,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 4_000,
        }),
        createSample({
          eastMeters: 32,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 6_000,
        }),
        createSample({
          eastMeters: 40,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 8_000,
        }),
        createSample({
          eastMeters: 48,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 10_000,
        }),
      ],
    },
    {
      name: "mild drift",
      description: "User stays on-route at first, then slips outside the corridor but does not escalate to a hard deviation.",
      route: buildStraightRoute(),
      samples: [
        createSample({
          eastMeters: 8,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 0,
        }),
        createSample({
          eastMeters: 16,
          northMeters: 5,
          headingDegrees: 90,
          timestampMs: 2_000,
        }),
        createSample({
          eastMeters: 24,
          northMeters: 11,
          headingDegrees: 90,
          timestampMs: 4_000,
        }),
        createSample({
          eastMeters: 32,
          northMeters: 12,
          headingDegrees: 90,
          timestampMs: 6_000,
        }),
        createSample({
          eastMeters: 40,
          northMeters: 13,
          headingDegrees: 90,
          timestampMs: 8_000,
        }),
        createSample({
          eastMeters: 48,
          northMeters: 12,
          headingDegrees: 90,
          timestampMs: 10_000,
        }),
      ],
    },
    {
      name: "strong deviation",
      description: "User starts on-route, drifts away, then accumulates enough evidence for a hard deviation.",
      route: buildStraightRoute(),
      samples: [
        createSample({
          eastMeters: 8,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 0,
        }),
        createSample({
          eastMeters: 16,
          northMeters: 4,
          headingDegrees: 90,
          timestampMs: 2_000,
        }),
        createSample({
          eastMeters: 24,
          northMeters: 11,
          headingDegrees: 90,
          timestampMs: 4_000,
        }),
        createSample({
          eastMeters: 32,
          northMeters: 18,
          headingDegrees: 0,
          timestampMs: 6_000,
        }),
        createSample({
          eastMeters: 40,
          northMeters: 20,
          headingDegrees: 0,
          timestampMs: 8_000,
        }),
        createSample({
          eastMeters: 48,
          northMeters: 22,
          headingDegrees: 0,
          timestampMs: 10_000,
        }),
      ],
    },
    {
      name: "missed turn",
      description: "User enters the turn approach zone, keeps walking straight, then clearly passes the turn without turning.",
      route: buildLeftTurnRoute(),
      samples: [
        createSample({
          eastMeters: 20,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 0,
        }),
        createSample({
          eastMeters: 30,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 2_000,
        }),
        createSample({
          eastMeters: 38,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 4_000,
        }),
        createSample({
          eastMeters: 42,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 6_000,
        }),
        createSample({
          eastMeters: 47,
          northMeters: 4,
          headingDegrees: 90,
          timestampMs: 8_000,
        }),
        createSample({
          eastMeters: 52,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 10_000,
        }),
      ],
    },
  ];
}
