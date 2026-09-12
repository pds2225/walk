import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { RouteDeviationEngine } from "../src/index.js";
import type {
  DeviationState,
  PositionSample,
  RouteModel,
  SuggestedAction,
} from "../src/types/index.js";

interface GoldenTrace {
  readonly name: string;
  readonly route: RouteModel;
  readonly samples: readonly PositionSample[];
  readonly expected: readonly {
    readonly state: DeviationState;
    readonly suggestedNextAction: SuggestedAction;
  }[];
}

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/golden_trace.json", import.meta.url), "utf8")
) as GoldenTrace;

describe("Python/TypeScript shared golden trace", () => {
  it("keeps the TypeScript engine aligned with the shared expected decisions", () => {
    const engine = new RouteDeviationEngine(fixture.route);
    const actual = fixture.samples.map((sample) => {
      const result = engine.processSample(sample);
      return {
        state: result.state,
        suggestedNextAction: result.suggestedNextAction,
      };
    });
    expect(actual).toEqual(fixture.expected);
  });
});
