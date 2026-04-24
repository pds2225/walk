# Progress Notes

## Completed

- finished Milestone 1 for the walking route deviation engine only
- added strict TypeScript, Vitest, ESLint, and command scripts
- added typed route, turn-point, sample, config, metrics, and result models
- implemented geometry utilities:
  - `distanceMeters`
  - `bearingDegrees`
  - `normalizeHeading`
  - `angularDifference`
  - `pointToSegmentDistanceMeters`
  - `pointToPolylineDistanceMeters`
- implemented route-context helpers:
  - segment heading derivation
  - nearest route segment lookup
  - nearest and next turn lookup
  - distance-to-turn calculation
  - expected heading lookup
- implemented a pure decision step and a stateful `RouteDeviationEngine`
- implemented missed-turn pass-by detection
- added a CLI simulator with four required scenarios
- documented the local Streamlit web demo run path for non-developer use
- added automated tests for geometry, route context, engine states, noise handling, reset logic, and config overrides
- validated:
  - `npm run test:run`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run simulate`
- implemented the Milestone 2 local web demo code path in `streamlit_walk_engine/`
- fixed the simulator scenario data so the documented state transitions are now visible in both the CLI simulator and the Streamlit demo
- made the Streamlit demo import-safe as both a local script and a Python package
- pinned Streamlit demo dependency versions in `streamlit_walk_engine/requirements.txt`
- added a guarded `web:install` flow so pinned demo packages are checked quickly before calling pip
- added a Windows-safe `run_demo.py` launcher because direct `python -m streamlit run ...` could hang before binding the local port
- verified the compatibility launcher starts the local Streamlit server and binds `127.0.0.1:8501` successfully in this environment
- added 6-sample scenario flows for:
  - `normal_walking`
  - `mild_drift`
  - `strong_deviation`
  - `missed_turn`
- verified:
  - `npm run web:install`
  - `npm run web:demo`
  - `http://127.0.0.1:8501` TCP port opens successfully
  - TypeScript simulator transitions
  - Python-port transitions match the TypeScript simulator exactly
  - all four web-demo scenarios produce the expected state progression in engine output

## Remains Out of Scope

- mobile UI
- map SDK integration
- native GPS permission handling
- text-to-speech or vibration alerts
- backend API
- database
- authentication
- production deployment

## Blockers Encountered

- no active blocker remains for Milestone 2

## Next Milestone Recommendation

- manually confirm `npm run web:demo` from a normal local terminal and capture one screenshot of each scenario
- connect this engine to a mobile location sampling pipeline
- add route ingestion and reroute orchestration outside the core engine
- add alert delivery integration such as UI, sound, or vibration outside this repository scope
- evaluate optional GPS smoothing before engine input if real-device noise proves higher than synthetic tests
