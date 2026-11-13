import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
const from = "2026-11-09T00:00:00Z", to = "2026-11-09T01:00:00Z";
let fetchMock: ReturnType<typeof vi.fn>;
const call = (authorization = "Bearer test-key", query = `?from=${from}&to=${to}`) => GET(new Request("https://k-navi.vercel.app/api/v1/poc/aihows-location-records" + query, { headers: { authorization } }));
beforeEach(() => {
  vi.stubEnv("AIHOWS_GPS_API_ENABLED", "true");
  vi.stubEnv("AIHOWS_GPS_API_KEY", "test-key");
  vi.stubEnv("AIHOWS_LEGAL_NAME", "AIHows Verified Corporation");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("AIHows GPS consent-gated export", () => {
  it("is disabled by default and rejects unauthorized callers", async () => {
    vi.stubEnv("AIHOWS_GPS_API_ENABLED", "");
    expect((await call()).status).toBe(503);
    vi.stubEnv("AIHOWS_GPS_API_ENABLED", "true");
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("only queries the consent-gated view with recipient and notice filters", async () => {
    expect((await call()).status).toBe(200);
    const u = new URL(fetchMock.mock.calls[0]![0]);
    expect(u.pathname).toBe("/rest/v1/aihows_shareable_location_events");
    expect(u.searchParams.get("recipient_legal_name")).toBe("eq.AIHows Verified Corporation");
    expect(u.searchParams.get("notice_version")).toBe("eq.aihows-poc-2026-11-v1");
    expect(u.searchParams.getAll("created_at")).toHaveLength(2);
    expect(u.searchParams.get("select")).not.toContain("user_agent");
  });
  it("rejects invalid date and unsupported filters without touching DB", async () => {
    expect((await call("Bearer test-key", "?from=bad&to=bad")).status).toBe(400);
    expect((await call("Bearer test-key", `?from=${from}&to=${to}&visitor_id=x`)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
