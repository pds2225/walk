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
          eastMeters: 10,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 1_000,
        }),
        createSample({
          eastMeters: 25,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 3_000,
        }),
        createSample({
          eastMeters: 40,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 5_000,
        }),
      ],
    },
    {
      name: "mild drift",
      description: "User is slightly off the route corridor but still moving forward.",
      route: buildStraightRoute(),
      samples: [
        createSample({
          eastMeters: 20,
          northMeters: 11,
          headingDegrees: 90,
          timestampMs: 1_000,
        }),
        createSample({
          eastMeters: 28,
          northMeters: 12,
          headingDegrees: 90,
          timestampMs: 3_000,
        }),
      ],
    },
    {
      name: "strong deviation",
      description: "User keeps moving away from the walking route for multiple samples.",
      route: buildStraightRoute(),
      samples: [
        createSample({
          eastMeters: 20,
          northMeters: 18,
          headingDegrees: 0,
          timestampMs: 1_000,
        }),
        createSample({
          eastMeters: 25,
          northMeters: 18,
          headingDegrees: 0,
          timestampMs: 3_000,
        }),
        createSample({
          eastMeters: 30,
          northMeters: 18,
          headingDegrees: 0,
          timestampMs: 5_000,
        }),
      ],
    },
    {
      name: "missed turn",
      description: "User enters the turn approach zone but keeps walking straight past a left turn.",
      route: buildLeftTurnRoute(),
      samples: [
        createSample({
          eastMeters: 32,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 1_000,
        }),
        createSample({
          eastMeters: 40,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 2_000,
        }),
        createSample({
          eastMeters: 52,
          northMeters: 0,
          headingDegrees: 90,
          timestampMs: 3_000,
        }),
      ],
    },
  ];
}
