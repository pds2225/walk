import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const base = "https://k-navi.vercel.app/api/v1/poc/store-aggregates";
const from = "2026-11-09T00:00:00Z", to = "2026-11-10T00:00:00Z";
const call = (q = `?from=${from}&to=${to}`, authorization = "Bearer test-key") =>
  GET(new Request(base + q, { headers: { authorization } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("POC_AGGREGATE_API_ENABLED", "true");
  vi.stubEnv("POC_LOCATION_API_KEY", "test-key");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("GET /api/v1/poc/store-aggregates", () => {
  it("fails closed without opt-in or authentication", async () => {
    vi.stubEnv("POC_AGGREGATE_API_ENABLED", "");
    expect((await call()).status).toBe(503);
    vi.stubEnv("POC_AGGREGATE_API_ENABLED", "true");
    expect((await call(undefined, "")).status).toBe(401);
    expect((await call(undefined, "Bearer wrong")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported filters and invalid windows", async () => {
    for (const q of ["", "?from=bad&to=bad", `?from=${from}&to=${to}&visitor_id=abc`,
      "?from=2026-11-09T00:00:00Z&to=2026-11-11T00:00:00Z",\n      "?from=2026-11-09T00:00:00Z&to=2026-11-09T12:00:00Z"]) {
      expect((await call(q)).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("suppresses groups under five distinct visitors and never exposes raw IDs or GPS", async () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => ({ store_id: "worldcup-market-01", visitor_id: `visitor-0000${i}` })),
      ...Array.from({ length: 4 }, (_, i) => ({ store_id: "worldcup-market-02", visitor_id: `visitor-0000${i}` })),
      { store_id: "worldcup-market-01", visitor_id: "visitor-00000" },
    ];
    fetchMock.mockResolvedValue(new Response(JSON.stringify(rows), { status: 200 }));
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stores).toEqual([{ store_id: "worldcup-market-01", unique_qr_or_web_visitors: 5, store_view_events: 5 }]);
    expect(JSON.stringify(body)).not.toContain("visitor-00000");
    expect(JSON.stringify(body)).not.toContain("lat");
    const [url, init] = fetchMock.mock.calls[0]!;
    const q = new URL(url);
    expect(q.searchParams.get("select")).toBe("store_id,visitor_id");
    expect(q.searchParams.get("event")).toBe("eq.store_view");
    expect(q.searchParams.get("app")).toBe("eq.worldcup-market");
    expect(q.searchParams.getAll("created_at")).toHaveLength(2);
    expect(init.headers.apikey).toBe("sb_secret_test");
  });

  it("does not return partial statistics when more than 5000 events exist", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(
      Array.from({ length: 1000 }, (_, i) => ({ store_id: "worldcup-market-01", visitor_id: `visitor-${String(i).padStart(8, "0")}` }))
    ), { status: 200 })));
    const res = await call();
    expect(res.status).toBe(422);
    expect((await res.json()).stores).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("fails closed on malformed DB data or upstream errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ store_id: "x", visitor_id: "x" }]), { status: 200 }));
    expect((await call()).status).toBe(502);
    fetchMock.mockResolvedValueOnce(new Response("private error", { status: 500 }));
    const res = await call();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("private error");
  });
});
