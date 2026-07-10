import { createEngineConfig } from "../config/index.js";
import { prepareRouteModel } from "../domain/index.js";
import { evaluateDeviationStep } from "./evaluateDeviation.js";
import type { EngineConfig, EngineResult, EngineSessionState, PositionSample, RouteModel } from "../types/index.js";

export class RouteDeviationEngine {
  readonly #preparedRoute;
  readonly #config;
  #sessionState: EngineSessionState;

  constructor(route: RouteModel, configOverrides: Partial<EngineConfig> = {}) {
    this.#preparedRoute = prepareRouteModel(route);
    this.#config = createEngineConfig(configOverrides);
    this.#sessionState = {
      consecutiveThresholdBreaches: 0,
    };
  }

  processSample(sample: PositionSample): EngineResult {
    const evaluation = evaluateDeviationStep({
      preparedRoute: this.#preparedRoute,
      sample,
      sessionState: this.#sessionState,
      config: this.#config,
    });

    this.#sessionState = evaluation.nextSessionState;

    return evaluation.result;
  }

  reset(): void {
    this.#sessionState = {
      consecutiveThresholdBreaches: 0,
    };
  }

  getConfig(): EngineConfig {
    return this.#config;
  }

  getSessionState(): EngineSessionState {
    return {
      ...this.#sessionState,
    };
  }
}

export function createRouteDeviationEngine(
  route: RouteModel,
  configOverrides: Partial<EngineConfig> = {}
): RouteDeviationEngine {
  return new RouteDeviationEngine(route, configOverrides);
}
