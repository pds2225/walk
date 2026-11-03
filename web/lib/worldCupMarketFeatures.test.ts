import { afterEach, describe, expect, it, vi } from "vitest";
import { worldCupMarketWalkingEnabled } from "./worldCupMarketFeatures";

afterEach(() => vi.unstubAllEnvs());
describe("market walking visibility", () => {
  it("opens walking by default and retains an explicit off switch", () => {
    vi.stubEnv("NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED", undefined);
    expect(worldCupMarketWalkingEnabled()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED", "false");
    expect(worldCupMarketWalkingEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED", "true");
    expect(worldCupMarketWalkingEnabled()).toBe(true);
  });
});
