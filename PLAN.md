PLAN.md

# IMPLEMENTATION PLAN
## Project
Walk - Milestone 1
Pedestrian Route Deviation Detection Engine

## Planning Principle
This milestone must produce a small but complete route-deviation engine for walking navigation.
The engine must be independently testable before any UI or SDK integration begins.

---

# Milestone 1 Overview
Build the following layers in order:
1. project scaffolding
2. domain types
3. geometry utilities
4. route analysis helpers
5. deviation engine
6. pass-by detection
7. simulator
8. test completion
9. documentation
10. final validation

Do not change the milestone order unless blocked.

---

# Step 1. Project Scaffolding
## Goal
Set up a clean TypeScript package that can run tests, lint, and type checking.

## Tasks
1. Initialize package.json
2. Add TypeScript
3. Add Vitest
4. Add ESLint
5. Add tsconfig.json in strict mode
6. Add scripts:
   - test
   - test:run
   - lint
   - typecheck
   - simulate
7. Create base folder structure

## Expected Output
A runnable project shell with empty source/test directories.

## Validation
- npm install succeeds
- npm run typecheck succeeds
- npm run lint succeeds
- npm run test:run succeeds even if no real tests yet

---

# Step 2. Domain Types
## Goal
Create clear type definitions for route data and engine outputs.

## Tasks
1. Define Coordinate
2. Define PositionSample
3. Define TurnDirection
4. Define TurnPoint
5. Define RoutePolyline
6. Define RouteModel
7. Define DeviationState enum or union
8. Define SuggestedAction enum or union
9. Define EngineConfig
10. Define EngineMetrics
11. Define EngineResult

## Expected Output
Strongly typed reusable domain models.

## Validation
- Type definitions compile under strict mode
- No any types
- Types are imported cleanly across modules

---

# Step 3. Geometry Utilities
## Goal
Implement core geometric calculations needed by the engine.

## Tasks
1. Implement haversine distance in meters
2. Implement bearing calculation between two coordinates
3. Implement heading normalization
4. Implement smallest angular difference
5. Implement point-to-segment distance approximation suitable for short pedestrian routes
6. Implement point-to-polyline shortest distance

## Expected Output
Pure geometry functions with unit tests.

## Validation
- Tests cover expected meter ranges
- Angular difference is always between 0 and 180
- Polyline distance works on multi-segment routes

---

# Step 4. Route Analysis Helpers
## Goal
Extract route context needed for decision making.

## Tasks
1. Derive segment headings from route polyline
2. Determine nearest route segment for a position sample
3. Determine nearest turn point
4. Determine distance to next turn point
5. Determine whether a sample is before or after a turn point
6. Provide helper for expected heading near the current route segment

## Expected Output
Functions that translate raw geometry into route-aware context.

## Validation
- Tests for nearest segment selection
- Tests for expected heading lookup
- Tests for turn point proximity

---

# Step 5. Base Deviation Engine
## Goal
Implement the first decision layer for on_route, drifting, and deviated states.

## Tasks
1. Create default walking config
2. Implement score calculation using:
   - distance from route
   - heading difference
   - consecutive sample count
   - duration over threshold
3. Implement decision rules:
   - on_route
   - drifting
   - deviated
4. Return structured EngineResult

## Expected Output
A deterministic decision engine for non-turn-specific deviation.

## Validation
- Normal route samples return on_route
- Mild off-route movement returns drifting
- Sustained off-route movement returns deviated
- Noisy single-sample spikes do not trigger deviated

---

# Step 6. Pass-by Detection
## Goal
Detect missed turn situations.

## Tasks
1. Detect when user enters turn-point approach zone
2. Detect when user crosses beyond the turn point without making the expected turn
3. Compare post-turn heading against expected post-turn heading
4. Classify state as passed_turn when criteria are met
5. Add reasons and metrics to result

## Expected Output
Turn-specific error detection for walking scenarios.

## Validation
- Simulated missed left turn triggers passed_turn
- Simulated correct left turn does not trigger passed_turn
- Straight route does not falsely trigger pass-by logic

---

# Step 7. Scenario State Management
## Goal
Track multiple samples over time so decisions can use persistence and duration.

## Tasks
1. Create engine session state
2. Track consecutive threshold-violating samples
3. Track when drift started
4. Track whether a turn-point approach zone has been entered
5. Reset counters appropriately when user returns on route

## Expected Output
Stateful engine wrapper around pure calculations.

## Validation
- Drift counter resets after return to route
- Duration logic behaves correctly
- Turn approach state is tracked correctly

---

# Step 8. Simulator
## Goal
Provide a small synthetic scenario runner for fast manual inspection.

## Tasks
1. Create one normal walking scenario
2. Create one drifting scenario
3. Create one deviation scenario
4. Create one missed-turn scenario
5. Print readable outputs for each sample or each scenario summary

## Expected Output
CLI simulator runnable from npm script.

## Validation
- npm run simulate executes successfully
- Output clearly shows state transitions

---

# Step 9. Test Completion
## Goal
Ensure enough confidence for milestone handoff.

## Required Test Categories
1. geometry correctness
2. on_route scenario
3. drifting scenario
4. deviated scenario
5. passed_turn scenario
6. noisy GPS scenario
7. counter reset scenario
8. config override scenario

## Expected Output
A robust automated test suite.

## Validation
- All tests pass
- Critical branches covered
- Failing conditions are meaningful and reproducible

---

# Step 10. Documentation
## Goal
Make the milestone understandable to a future developer or future Codex task.

## Tasks
1. Update README.md
2. Add docs/progress-notes.md
3. Explain decision states
4. Explain config values
5. Explain test and simulator commands
6. Summarize blockers if any

## Validation
- README is accurate
- progress-notes.md reflects actual implementation status

---

# Step 11. Final Validation
## Goal
Confirm milestone completion against DONE.md.

## Required Commands
1. npm run test:run
2. npm run lint
3. npm run typecheck
4. npm run simulate

## Required Review Checks
1. No scope creep into mobile UI or backend
2. No dead files or placeholder TODO-only modules
3. Clear exported entry point
4. Readable module boundaries
5. Blockers documented if anything incomplete

## Completion Rule
Do not declare milestone complete until DONE.md conditions are satisfied.