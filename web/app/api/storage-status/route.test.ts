import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const cookie = "ktrip_vid=abcdef12-3456";
const request = (value?: string) => new Request("https://k-navi-eight.vercel.app/api/storage-status", {
  headers: value ? { cookie: value } : {},
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  fetchMock = vi.fn(async (url: URL) => new Response(
    JSON.stringify(url.pathname.endsWith("/events") ? [{ id: 1 }] : [{ id: 2 }]),
    { status: 200, headers: { "content-type": "application/json" } },
  ));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("GET /api/storage-status", () => {
  it("rejects missing or malformed browser cookies without querying private data", async () => {
    expect((await GET(request())).status).toBe(400);
    expect((await GET(request("ktrip_vid=bad/value"))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports unconfigured DB rather than success", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    const response = await GET(request(cookie));
    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe("storage_unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads back both recent events and QR rows for only the calling browser", async () => {
    const response = await GET(request(cookie));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      status: "storage_connected",
      recent_events_saved: true,
      recent_qr_scans_saved: true,
      lookback_minutes: 15,
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(JSON.stringify(body)).not.toContain("abcdef12-3456");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const urls: URL[] = fetchMock.mock.calls.map(([url]) => url as URL);
    expect(urls.map((url) => url.pathname).sort()).toEqual(["/rest/v1/events", "/rest/v1/qr_scans"]);
    for (const url of urls) {
      expect(url.searchParams.get("visitor_id")).toBe("eq.abcdef12-3456");
      expect(url.searchParams.get("select")).toBe("id");
      expect(url.searchParams.get("limit")).toBe("1");
      expect(url.searchParams.get(url.pathname.endsWith("/events") ? "created_at" : "scanned_at")).toMatch(/^gte\.20\d\d-/);
    }
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.apikey).toBe("sb_secret_test");
      expect(init.headers.authorization).toBeUndefined();
      expect(init.cache).toBe("no-store");
    }
  });

  it("keeps connection and collection success separate when no QR scan was saved", async () => {
    fetchMock.mockImplementation(async (url: URL) =>
      new Response(JSON.stringify(url.pathname.endsWith("/qr_scans") ? [] : [{ id: 3 }]), { status: 200 }),
    );
    const response = await GET(request(cookie));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, recent_events_saved: true, recent_qr_scans_saved: false });
  });

  it("returns 502 for upstream failure, not a misleading empty count", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "db unavailable" }), { status: 503 }));
    const response = await GET(request(cookie));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, status: "storage_read_failed" });
  });

  it("rejects malformed storage output and honors legacy service-role header", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJlegacy_test");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const response = await GET(request(cookie));
    expect(response.status).toBe(502);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.authorization).toBe("Bearer eyJlegacy_test");
    }
  });
  it("optionally verifies market navigation samples and GPS in the same visitor's DB rows", async () => {
    fetchMock.mockImplementation(async (url: URL) => {
      const nav = url.searchParams.get("event") === "in.(nav_start,nav_progress,reroute,arrive)";
      const recordedGps = url.searchParams.get("lat") === "not.is.null";
      return new Response(JSON.stringify(
        nav && !recordedGps ? [{ id: 21 }] : nav && recordedGps ? [{ id: 22 }] : [{ id: 1 }],
      ), { status: 200 });
    });
    const res = await GET(new Request("https://k-navi-eight.vercel.app/api/storage-status?nav=1", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "storage_connected",
      recent_events_saved: true,
      recent_qr_scans_saved: true,
      recent_market_navigation_events_saved: true,
      recent_market_navigation_gps_saved: true,
    });
    expect(JSON.stringify(body)).not.toContain("abcdef12-3456");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const navUrls = fetchMock.mock.calls.map(([u]) => u as URL)
      .filter(u => u.searchParams.has("app"));
    expect(navUrls).toHaveLength(2);
    for (const url of navUrls) {
      expect(url.searchParams.get("app")).toBe("eq.worldcup-market");
      expect(url.searchParams.get("visitor_id")).toBe("eq.abcdef12-3456");
    }
    expect(navUrls.some(u => u.searchParams.get("lat") === "not.is.null")).toBe(true);
  });

  it("does not report saved GPS when the visitor has only non-GPS navigation records", async () => {
    fetchMock.mockImplementation(async (url: URL) => new Response(JSON.stringify(
      url.searchParams.get("lat") === "not.is.null" ? [] : [{ id: 2 }]
    ), { status: 200 }));
    const res = await GET(new Request("https://k-navi-eight.vercel.app/api/storage-status?nav=1", { headers: { cookie } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      recent_market_navigation_events_saved: true, recent_market_navigation_gps_saved: false,
    });
  });

});
