import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queued: Array<() => Promise<void>> = [];
vi.mock("next/server", async (original) => {
  const base = await original<typeof import("next/server")>();
  return { ...base, after: (callback: () => Promise<void>) => { queued.push(callback); } };
});

const { POST } = await import("./track/route");
const { GET } = await import("./storage-status/route");
const { trackRateBuckets } = await import("../../lib/qrScan");

const browserCookie = "ktrip_vid=visitor-001-1122";
const navigationId = "a1b2c3d4-1234-4abc-8def-1234567890ab";
const visitBody = (event: string, consented: boolean, pos?: { lat: number; lng: number }) => ({
  event, store_id: "worldcup-market-01", navigation_id: navigationId,
  geo_consent: consented, ...(pos ?? {}), accuracy_m: pos ? 9 : null,
  session_id: "browser-12345678", path: "/worldcup-market",
});

type FakeRecord = Record<string, unknown> & { id: number; created_at: string };
let recorded: FakeRecord[] = [];
let requests: ReturnType<typeof vi.fn>;

beforeEach(() => {
  queued.length = 0;
  recorded = [];
  trackRateBuckets.clear();
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_fixture");
  requests = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(input);
    if (url.pathname === "/rest/v1/events" && init?.method === "POST") {
      const row = JSON.parse(String(init.body)) as Record<string, unknown>;
      recorded.push({ ...row, id: recorded.length + 1, created_at: new Date().toISOString() });
      return new Response(null, { status: 201 });
    }
    if (init?.method !== undefined && init.method !== "GET") throw Error("unexpected method");
    const isEvents = url.pathname === "/rest/v1/events";
    if (!isEvents && url.pathname !== "/rest/v1/qr_scans") throw Error("unexpected table");
    const filter = url.searchParams;
    const items = isEvents ? recorded.filter((row) => {
      const visitorFilter = filter.get("visitor_id");
      const dateFilter = filter.get("created_at");
      if (visitorFilter && row.visitor_id !== visitorFilter.slice(3)) return false;
      if (dateFilter && Date.parse(row.created_at) < Date.parse(dateFilter.slice(4))) return false;
      if (filter.get("app") === "eq.worldcup-market" && row.app !== "worldcup-market") return false;
      if (filter.get("event")?.startsWith("in.") && !["nav_start", "nav_progress", "reroute", "arrive"].includes(String(row.event))) return false;
      if (filter.get("lat") === "not.is.null" && (row.lat == null || row.lng == null)) return false;
      return true;
    }) : [];
    return new Response(JSON.stringify(items.slice(0, 1).map((row) => ({ id: row.id }))), { status: 200 });
  });
  vi.stubGlobal("fetch", requests);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const send = (body: object) => POST(new Request("https://k-navi-eight.vercel.app/api/track", {
  method: "POST", headers: { cookie: browserCookie }, body: JSON.stringify(body),
}));
const readback = (cookie = browserCookie) => GET(new Request("https://k-navi-eight.vercel.app/api/storage-status?nav=1", {
  headers: { cookie },
}));

describe("K-Trip walking GPS collection → PostgREST-like persistence → same-browser readback", () => {
  it("does not claim storage before the async write, then verifies two consented samples", async () => {
    const start = await send(visitBody("nav_start", true, { lat: 37.5587, lng: 126.9051 }));
    expect(start.status).toBe(202);
    const before = await (await readback()).json();
    expect(before.recent_market_navigation_gps_saved).toBe(false);
    expect(queued).toHaveLength(1);
    await queued.shift()!();

    const progress = await send(visitBody("nav_progress", true, { lat: 37.5589, lng: 126.9053 }));
    expect(progress.status).toBe(202);
    await queued.shift()!();

    const verification = await readback();
    const report = await verification.json();
    expect(verification.status).toBe(200);
    expect(report).toMatchObject({
      ok: true, status: "storage_connected", recent_events_saved: true,
      recent_qr_scans_saved: false, recent_market_navigation_events_saved: true,
      recent_market_navigation_gps_saved: true, lookback_minutes: 15,
    });
    expect(recorded).toHaveLength(2);
    expect(recorded.every((row) => row.navigation_id === navigationId)).toBe(true);
    expect(recorded.every((row) => row.app === "worldcup-market" && row.geo_consent === true)).toBe(true);
    expect(recorded.map((row) => row.lat)).toEqual([37.5587, 37.5589]);
    expect(JSON.stringify(report)).not.toContain("visitor-001-1122");
    expect(JSON.stringify(report)).not.toContain("37.5587");
  });

  it("rejects coordinate data without consent, preserves earlier data and returns no other browser's history", async () => {
    expect((await send(visitBody("nav_start", false, { lat: 37.5587, lng: 126.9051 }))).status).toBe(400);
    expect(recorded).toHaveLength(0);
    expect(queued).toHaveLength(0);

    expect((await send(visitBody("nav_start", true, { lat: 37.5587, lng: 126.9051 }))).status).toBe(202);
    await queued.shift()!();

    expect((await send(visitBody("nav_progress", false))).status).toBe(202);
    await queued.shift()!();
    expect(recorded[1]!.lat).toBeUndefined();
    expect(recorded[1]!.geo_consent).toBe(false);
    expect(recorded[0]!.lat).toBe(37.5587);

    const own = await (await readback()).json();
    expect(own.recent_market_navigation_gps_saved).toBe(true);
    const other = await (await readback("ktrip_vid=visitor-002-1122")).json();
    expect(other.recent_market_navigation_events_saved).toBe(false);
    expect(other.recent_market_navigation_gps_saved).toBe(false);
  });
});
