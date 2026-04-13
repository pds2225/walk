PROMPT.md

# PROJECT PROMPT
## Project Name
Bobora WalkGuard - Pedestrian Route Deviation Detection Engine

## Product Goal
Build the first milestone of a walking-navigation product that detects when a pedestrian has gone the wrong way before full rerouting happens.

The product is for walking only.
Do not build a car navigation system.
Do not build full mobile UI.
Do not integrate live GPS permissions or native device APIs yet.

## Core User Problem
When walking with navigation, users often:
- miss a turn
- keep walking straight past a turn point
- enter the wrong alley
- realize the mistake too late because rerouting happens after noticeable drift

The goal of this milestone is to create a reusable route-deviation engine that can later be connected to a mobile app.

## Scope of This Milestone
Implement only the route deviation core engine and its test harness.

### In Scope
1. Route polyline model
2. Turn point model
3. Position sample model
4. Distance-from-route calculation
5. Heading difference calculation
6. Pass-by detection for turn points
7. Alert decision logic
8. Configurable threshold system
9. Unit tests
10. Small simulator script with sample scenarios
11. Basic README update

### Out of Scope
- Mobile app UI
- Real map SDK integration
- Real GPS permission handling
- TTS or vibration APIs
- Backend API server
- Database
- User authentication
- Production deployment

## Functional Requirements

### Requirement 1: Position Sample Input
The engine must accept sequential pedestrian position samples.
Each sample should contain:
- latitude
- longitude
- heading in degrees
- speed in m/s
- timestamp in milliseconds

### Requirement 2: Route Model
The route model must support:
- route polyline as an ordered list of coordinates
- turn points as structured objects
- route segment direction derivation

### Requirement 3: Distance From Route
The engine must calculate the shortest distance from the current position to the route polyline.
The output should be in meters.

### Requirement 4: Heading Difference
The engine must calculate the absolute directional difference between:
- user heading
- expected route segment heading

The result should be normalized to 0 to 180 degrees.

### Requirement 5: Pass-by Detection
The engine must detect when the user has:
- approached a turn point
- failed to turn
- continued moving in a conflicting direction after the turn point

### Requirement 6: Deviation Decision
The engine must classify current state into one of the following:
- on_route
- drifting
- deviated
- passed_turn

The engine should use distance, heading difference, duration, and turn-point context together.
A single noisy sample must not immediately trigger deviation.

### Requirement 7: Configurable Thresholds
Thresholds must be configurable.
Default walking thresholds should be provided.

Suggested defaults:
- route drift distance threshold: 10 meters
- route deviation distance threshold: 15 meters
- strong deviation distance threshold: 25 meters
- heading difference threshold: 45 degrees
- pass-by post-turn distance threshold: 8 meters
- minimum consecutive samples for deviation: 3
- minimum drift duration: 4000 ms

### Requirement 8: Alert Output
The engine does not need to trigger UI.
Instead, it must return a machine-readable result object that includes:
- state
- score
- reasons
- metrics used for decision
- suggested next action

Suggested next actions:
- none
- monitor
- warn_user
- reroute_candidate

## Non-Functional Requirements
1. Code must be modular and testable.
2. Code must be strongly typed.
3. Logic should be deterministic.
4. No silent failure.
5. Pure calculation logic should be separated from scenario state management.
6. Tests must cover normal path, drift, deviation, pass-by, and GPS noise cases.

## Technical Stack
- Language: TypeScript
- Runtime: Node.js
- Test framework: Vitest
- Lint: ESLint
- Type check: TypeScript strict mode

## Suggested Directory Structure
packages/route-engine/
  src/
    types/
    config/
    geometry/
    domain/
    engine/
    simulator/
  tests/

## Coding Rules
1. Prefer small pure functions.
2. Keep geometry math separate from decision rules.
3. Avoid unnecessary abstractions.
4. Add comments only where logic is non-obvious.
5. Use descriptive type names and function names.
6. Do not introduce external map SDK dependencies.
7. Do not use mock network calls.

## Required Deliverables
1. Working TypeScript route deviation engine
2. Unit tests for all critical cases
3. Sample simulator script
4. Updated README with:
   - project purpose
   - how to run tests
   - how to run simulator
   - summary of decision states
5. Progress notes file documenting completed work and blockers

## Execution Instructions
Before coding:
1. Read PLAN.md
2. Read DONE.md
3. Follow PLAN.md milestone order exactly

During implementation:
1. Implement one subtask at a time
2. Run tests after meaningful changes
3. Run lint and typecheck before marking any step done
4. If blocked, document the blocker clearly
5. Do not expand scope beyond this milestone

## Final Deliverable Expectations
By the end of this milestone, a developer should be able to:
- feed synthetic walking location samples into the engine
- receive route-state judgments
- verify logic through tests
- use the engine later in a mobile navigation app

## Priority Order
1. correctness
2. test coverage
3. readability
4. modular structure
5. extensibility