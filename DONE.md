DONE.md
# DEFINITION OF DONE
## Project
Bobora WalkGuard - Milestone 1
Pedestrian Route Deviation Detection Engine

This file defines the exact completion criteria for the milestone.
Do not mark the work complete unless all mandatory conditions are satisfied.

---

# A. Mandatory Functional Completion

## A1. Engine Input Models Exist
The codebase must define and use typed models for:
- Coordinate
- PositionSample
- TurnPoint
- RouteModel
- EngineConfig
- EngineResult

Condition:
- These types are not placeholders
- These types are used by the engine entry points

## A2. Geometry Layer Exists
The codebase must implement:
- distanceMeters
- bearingDegrees
- normalizeHeading
- angularDifference
- pointToSegmentDistanceMeters
- pointToPolylineDistanceMeters

Condition:
- These functions are unit tested

## A3. Route Context Layer Exists
The codebase must implement helpers for:
- segment heading derivation
- nearest segment lookup
- next turn point lookup
- distance to turn point
- expected heading retrieval

Condition:
- These helpers are used by the engine

## A4. Stateful Engine Exists
The codebase must implement a route-deviation engine that accepts sequential samples and returns structured results.

Condition:
- A consumer can instantiate the engine
- A consumer can feed samples one by one
- The engine returns a typed result each time

## A5. Required States Are Implemented
The engine must produce:
- on_route
- drifting
- deviated
- passed_turn

Condition:
- At least one test exists for each state
- passed_turn is not implemented as a placeholder only

## A6. Suggested Actions Are Implemented
The engine result must include:
- none
- monitor
- warn_user
- reroute_candidate

Condition:
- Actions are tied to state or metrics in a defensible way

---

# B. Mandatory Test Completion

## B1. Test Command Passes
The following command must pass:
npm run test:run

## B2. Minimum Test Categories Covered
There must be automated tests for:
1. geometry calculations
2. heading difference normalization
3. on-route scenario
4. drifting scenario
5. deviated scenario
6. missed-turn scenario
7. GPS noise scenario
8. counter reset scenario

## B3. No Placeholder Tests
Condition:
- No tests that simply assert true
- No skipped tests unless documented in progress-notes.md with reason

---

# C. Mandatory Quality Gates

## C1. Lint Passes
The following command must pass:
npm run lint

## C2. Type Check Passes
The following command must pass:
npm run typecheck

## C3. Strict Mode
Condition:
- tsconfig uses strict mode
- Code compiles under strict mode without suppressed type errors

## C4. No Silent Failures
Condition:
- No empty catch blocks
- No swallowed errors
- Unexpected states handled explicitly

---

# D. Mandatory Simulator Completion

## D1. Simulator Command Passes
The following command must pass:
npm run simulate

## D2. Required Scenarios Exist
The simulator must include:
- normal walking
- mild drift
- strong deviation
- missed turn

## D3. Simulator Output Is Understandable
Condition:
- Output includes state names
- Output includes at least one useful metric such as distance or heading difference

---

# E. Mandatory Documentation Completion

## E1. README Updated
README must include:
- project purpose
- milestone scope
- install instructions
- test instructions
- simulate instructions
- summary of engine states
- summary of config thresholds

## E2. Progress Notes Updated
A file must exist at:
docs/progress-notes.md

It must contain:
- what was completed
- what remains out of scope
- blockers encountered
- next milestone recommendation

---

# F. Mandatory Project Hygiene

## F1. Clean Project Structure
Condition:
- Relevant files are placed in logical directories
- No unnecessary experimental files remain

## F2. Export Entry Point Exists
Condition:
- There is a clear public entry point for the engine package

## F3. No Scope Creep
Condition:
- No mobile UI implementation
- No backend API implementation
- No DB implementation
- No map SDK integration

---

# G. Review Standard

The milestone is complete only if:
1. all mandatory functional items are implemented
2. test, lint, typecheck, and simulate commands all pass
3. documentation is updated
4. blockers are explicitly documented if partial completion exists

If any command fails, the milestone is not complete.

If some optional improvement exists but a mandatory item is missing, the milestone is not complete.

If blocked, produce the best partial result and document the blocker clearly in docs/progress-notes.md.