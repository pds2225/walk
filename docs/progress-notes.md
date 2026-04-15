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
- added automated tests for geometry, route context, engine states, noise handling, reset logic, and config overrides
- validated:
  - `npm run test:run`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run simulate`

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

- none

## Next Milestone Recommendation

- connect this engine to a mobile location sampling pipeline
- add route ingestion and reroute orchestration outside the core engine
- add alert delivery integration such as UI, sound, or vibration outside this repository scope
- evaluate optional GPS smoothing before engine input if real-device noise proves higher than synthetic tests
