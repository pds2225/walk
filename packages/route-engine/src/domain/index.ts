export {
  deriveSegmentHeadings,
  findNearestRouteSegment,
  findNearestTurnPoint,
  getDistancePastTurnPointMeters,
  getDistanceToTurnPointMeters,
  getExpectedHeadingForSegment,
  getNextTurnPoint,
  getTurnRelativePosition,
  prepareRouteModel,
} from "./routeAnalysis.js";

export type {
  NearestRouteSegment,
  NextTurnContext,
  PreparedRoute,
  PreparedTurnPoint,
  TurnRelativePosition,
} from "./routeAnalysis.js";
