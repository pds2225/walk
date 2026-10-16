import { describe, expect, it } from "vitest";
import config, { WORLDCUP_MARKET_HOST } from "../next.config";

describe("worldcup market host", () => {
  it("only the market host root redirects to /worldcup-market", async () => {
    const rules = await config.redirects!();
    expect(rules).toEqual([{ source: "/", has: [{ type: "host", value: WORLDCUP_MARKET_HOST }], destination: "/worldcup-market", permanent: false }]);
  });
});
