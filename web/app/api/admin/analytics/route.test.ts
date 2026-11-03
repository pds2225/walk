import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminSession, ADMIN_COOKIE } from "../../../../lib/adminAuth";
import { GET } from "./route";
beforeEach(() => {
  vi.stubEnv("ANALYTICS_ADMIN_PASSWORD", "test-admin-password-at-least-thirty-two-characters");
  vi.stubEnv("VERCEL_PROJECT_ID", ""); vi.stubEnv("STORAGE_PRODUCT", "walk");
  vi.stubEnv("SUPABASE_URL", "https://walktest.supabase.co"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const request = (query = "", loggedIn = true) => new Request(`https://app.test/api/admin/analytics?${query}`, { headers: loggedIn ? { cookie: `${ADMIN_COOKIE}=${adminSession()}` } : {} });
describe("admin read API", () => {
  it("blocks unauthorized reads and CSV before contacting DB", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await GET(request("format=csv", false))).status).toBe(401); expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns exactly 50 rows per page and preserves full count and anonymized stats", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(Array.from({ length: 55 }, (_, id) => ({ id, event: "home_view", app: "walk", created_at: new Date().toISOString(), visitor_id: "secret-visitor" })))));
    const response = await GET(request("app=walk")); const data = await response.json();
    expect(data.total).toBe(55); expect(data.rows).toHaveLength(50); expect(data.summary.eventCount).toBe(55);
    expect(JSON.stringify(data)).not.toContain("secret-visitor"); expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("does not turn schema failures into a zero KPI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 400 })));
    const response = await GET(request("app=walk")); expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ dataState: "unavailable" });
  });
});
