import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsCsv, analyticsFilters, loadAnalytics, summarizeAnalytics } from "./adminAnalytics";
beforeEach(() => { vi.stubEnv("ANALYTICS_ADMIN_PASSWORD", "test-admin-password-over-thirty-two-characters"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("analytics calculations and exports", () => {
  it("converts KST dates across UTC year boundaries and rejects injected filters", () => {
    const filters = analyticsFilters(new URLSearchParams({ from: "2026-01-01", to: "2026-01-01" }), new Date("2026-02-01"));
    expect(filters.since).toBe("2025-12-31T15:00:00.000Z"); expect(filters.until).toBe("2026-01-01T15:00:00.000Z");
    for (const params of [{ q: "x),or(id.gt.0" }, { page: "0" }, { app: "spoof" }, { sort: "lat" }, { from: "2026-02-30" }]) expect(() => analyticsFilters(new URLSearchParams(params))).toThrow();
  });
  it("counts matching navigation IDs without inventing legacy links or verified visits", () => {
    const result = summarizeAnalytics([
      { event: "nav_start", navigation_id: "a", store_id: "23", app: "worldcup-market" },
      { event: "nav_start", navigation_id: "a", store_id: "23", app: "worldcup-market" },
      { event: "arrive", navigation_id: "a", store_id: "23", app: "worldcup-market" },
      { event: "arrive", navigation_id: "a", store_id: "05", app: "worldcup-market" },
      { event: "arrive" }, { event: "qr_link_request", store_id: "23" }, { event: "store_view", store_id: "23", src: "qr" },
    ]);
    expect(result).toMatchObject({ identifiedNavigations: 1, matchedArrivalNavigations: 1, duplicateStartEvents: 1, arrivalWithoutStart: 2, verifiedVisits: null, unknownTraffic: 7 });
    expect(result.stores[0]).toMatchObject({ qr_link_request: 1, qr_landing: 1 });
    expect(summarizeAnalytics([]).eventArrivalRatio).toBeNull();
  });
  it("exports distinct UTC/KST with no raw position or identifiers, and neutralizes CSV formulas", () => {
    const csv = analyticsCsv([{ created_at: "2026-12-31T18:00:00Z", event: "=cmd()", lat: 37.55, lng: 126.9, visitor_id: "raw-person", src: 'a,"b' }]);
    expect(csv).toContain("2026-12-31T18:00:00.000Z"); expect(csv).toContain("2027-01-01T03:00:00.000+09:00");
    expect(csv).toContain("'=cmd()"); expect(csv).toContain('a,""b');
    expect(csv).not.toContain("37.55"); expect(csv).not.toContain("126.9"); expect(csv).not.toContain("raw-person");
  });
  it("reports missing configuration and DB errors as unavailable, not zero events", async () => {
    vi.stubEnv("VERCEL_PROJECT_ID", ""); vi.stubEnv("STORAGE_PRODUCT", "");
    await expect(loadAnalytics(analyticsFilters(new URLSearchParams()))).rejects.toThrow("STORAGE_UNCONFIGURED");
    vi.stubEnv("STORAGE_PRODUCT", "walk"); vi.stubEnv("SUPABASE_URL", "https://walktest.supabase.co"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 400 })));
    await expect(loadAnalytics(analyticsFilters(new URLSearchParams()))).rejects.toThrow("DATABASE_READ_FAILED_OR_SCHEMA_MISSING");
  });
  it("reads beyond a default 1000-row DB page and strips raw identifiers before returning", async () => {
    vi.stubEnv("VERCEL_PROJECT_ID", ""); vi.stubEnv("STORAGE_PRODUCT", "walk"); vi.stubEnv("SUPABASE_URL", "https://walktest.supabase.co"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test");
    const fetcher = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const range = (init.headers as Record<string, string>).Range;
      const rows = range === "0-999" ? Array.from({ length: 1000 }, (_, id) => ({ id, created_at: "2026-11-02T01:00:00Z", event: "home_view", app: "walk", visitor_id: "private", session_id: "private-tab" })) : [{ id: 1000, created_at: "2026-11-02T01:00:00Z", event: "home_view", app: "walk" }];
      return Response.json(rows, { headers: { "content-range": `${range}/1001` } });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await loadAnalytics(analyticsFilters(new URLSearchParams({ app: "walk", from: "2026-11-01", to: "2026-11-03" }), new Date("2026-11-04")));
    expect(result.rows).toHaveLength(1001); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(new URL(fetcher.mock.calls[0]![0]).searchParams.get("select")).not.toContain("lat");
  });
});
