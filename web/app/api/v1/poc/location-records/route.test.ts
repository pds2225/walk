import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const base = "https://k-navi.vercel.app/api/v1/poc/location-records";
const from = "2026-11-10T00:00:00Z";
const to = "2026-11-10T01:00:00Z";
function call(query = `?from=${from}&to=${to}`, auth = "Bearer test-key") {
  return GET(new Request(base + query, { headers: { authorization: auth } }));
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("POC_LOCATION_API_ENABLED", "true");
  vi.stubEnv("POC_LOCATION_API_KEY", "test-key");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("GET /api/v1/poc/location-records", () => {
  it("is disabled by default and fails closed without credentials", async () => {
    vi.stubEnv("POC_LOCATION_API_ENABLED", "");
    expect((await call()).status).toBe(503);
    vi.stubEnv("POC_LOCATION_API_ENABLED", "true");
    vi.stubEnv("POC_LOCATION_API_KEY", "");
    expect((await call()).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing or incorrect authentication without DB access", async () => {
    expect((await call(undefined, "")).status).toBe(401);
    expect((await call(undefined, "Bearer incorrect")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid date windows, pagination and visitor ids", async () => {
    for (const query of [
      "", "?from=bad&to=bad", "?from=2026-11-10T00:00:00Z&to=2026-11-12T00:00:00Z",
      `?from=${from}&to=${to}&limit=101`,
      `?from=${from}&to=${to}&offset=-1`,
      `?from=${from}&to=${to}&visitor_id=bad.id`,
    ]) expect((await call(query)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restricts PostgREST to consented market coordinates and selected columns", async () => {
    const res = await call(`?from=${from}&to=${to}&limit=25&offset=5&visitor_id=visitor-12345678`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const [url, options] = fetchMock.mock.calls[0]!;
    const q = new URL(url);
    expect(q.searchParams.get("app")).toBe("eq.worldcup-market");
    expect(q.searchParams.get("geo_consent")).toBe("eq.true");
    expect(q.searchParams.get("lat")).toBe("not.is.null");
    expect(q.searchParams.get("lng")).toBe("not.is.null");
    expect(q.searchParams.get("visitor_id")).toBe("eq.visitor-12345678");
    expect(q.searchParams.getAll("created_at")).toHaveLength(2);
    expect(q.searchParams.get("limit")).toBe("25");
    expect(q.searchParams.get("offset")).toBe("5");
    expect(q.searchParams.get("select")).not.toContain("user_agent");
    expect(options.headers.apikey).toBe("sb_secret_test");
    expect(options.headers.authorization).toBeUndefined();
  });

  it("returns a generic storage error without leaking keys", async () => {
    fetchMock.mockResolvedValue(new Response("private error", { status: 403 }));
    const res = await call();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("private error");
  });
});
