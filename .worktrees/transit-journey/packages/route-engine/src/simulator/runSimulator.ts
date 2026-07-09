import { RouteDeviationEngine } from "../engine/index.js";
import { createSimulationScenarios } from "./scenarios.js";

function formatMetric(value: number | undefined): string {
  return value === undefined ? "-" : value.toFixed(1);
}

for (const scenario of createSimulationScenarios()) {
  const engine = new RouteDeviationEngine(scenario.route);

  console.log(`\n=== ${scenario.name.toUpperCase()} ===`);
  console.log(scenario.description);

  scenario.samples.forEach((sample, sampleIndex) => {
    const result = engine.processSample(sample);

    console.log(
      [
        `sample ${sampleIndex + 1}`,
        `state=${result.state}`,
        `action=${result.suggestedNextAction}`,
        `score=${result.score.toFixed(2)}`,
        `distance=${formatMetric(result.metrics.distanceFromRouteMeters)}m`,
        `headingDiff=${formatMetric(result.metrics.headingDifferenceDegrees)}deg`,
        `turnPast=${formatMetric(result.metrics.distancePastTurnPointMeters)}m`,
      ].join(" | ")
    );
  });
}
