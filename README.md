# Walk

Milestone 1 of Walk is a reusable walking-route deviation engine.

Its job is simple:
- receive synthetic walking position samples one by one
- compare the current position against a planned walking route
- decide whether the pedestrian is still on the route, drifting away, clearly deviated, or has missed a turn

This repository intentionally contains only the route deviation engine and its test harness.

## Milestone Scope

Included in Milestone 1:
- route polyline and turn-point models
- distance-from-route calculation
- heading-difference calculation
- route-context helpers
- stateful route deviation engine
- missed-turn pass-by detection
- unit tests
- CLI simulator

Out of scope for this milestone:
- mobile UI
- map SDK integration
- native GPS permissions
- backend API
- database
- authentication

## Project Structure

```text
packages/route-engine/
  src/
    config/
    domain/
    engine/
    geometry/
    simulator/
    types/
  tests/
```

Public entry point:
- `packages/route-engine/src/index.ts`

## Install

```bash
npm install
```

## Commands

Run the automated tests:

```bash
npm run test:run
```

Run the type check:

```bash
npm run typecheck
```

Run the lint check:

```bash
npm run lint
```

Run the simulator:

```bash
npm run simulate
```

## Engine States

- `on_route`: the pedestrian is still close to the planned route and heading is acceptable.
- `drifting`: the pedestrian has started to move outside the safe route corridor, but the engine does not yet have enough evidence for a hard deviation.
- `deviated`: the pedestrian has stayed off-route for long enough, or across enough consecutive samples, that the engine can confidently warn about deviation.
- `passed_turn`: the pedestrian entered a turn approach zone and then continued past the turn without following the expected new direction.

## Suggested Actions

- `none`: no alert is needed.
- `monitor`: keep watching because the user may be starting to drift.
- `warn_user`: the user is likely off-route and should be warned.
- `reroute_candidate`: the route is likely wrong enough that rerouting should be considered next.

## Default Thresholds

These thresholds are the built-in walking defaults used by the engine:

- route drift distance threshold: `10 m`
- route deviation distance threshold: `15 m`
- strong deviation distance threshold: `25 m`
- heading difference threshold: `45 deg`
- pass-by post-turn distance threshold: `8 m`
- turn approach distance threshold: `12 m`
- minimum consecutive samples for deviation: `3`
- minimum drift duration: `4000 ms`

## Example Usage

```ts
import { RouteDeviationEngine } from "./packages/route-engine/src/index.js";

const engine = new RouteDeviationEngine({
  polyline: [
    { latitude: 37.5665, longitude: 126.9780 },
    { latitude: 37.5665, longitude: 126.9790 },
  ],
  turnPoints: [],
});

const result = engine.processSample({
  latitude: 37.5665,
  longitude: 126.9785,
  headingDegrees: 90,
  speedMetersPerSecond: 1.4,
  timestampMs: Date.now(),
});

console.log(result.state);
console.log(result.metrics.distanceFromRouteMeters);
```

## Test Coverage Summary

The current test suite covers:
- geometry calculations
- heading normalization and angular difference
- nearest-segment and turn-context lookup
- on-route scenario
- drifting scenario
- deviated scenario
- missed-turn scenario
- GPS noise recovery
- counter reset behavior
- config override behavior

## Simulator Scenarios

The simulator includes:
- normal walking
- mild drift
- strong deviation
- missed turn

Each simulator sample prints:
- engine state
- suggested action
- score
- route distance
- heading difference
- distance past a turn when relevant
