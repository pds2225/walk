import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackRateBuckets } from "../../../lib/qrScan";

const afterTasks: Array<() => Promise<void>> = [];
vi.mock("next/server", async (orig) => {
  const actual = await orig<typeof import("next/server")>();
  return { ...actual, after: (fn: () => Promise<void>) => { afterTasks.push(fn); } };
});
const { POST } = await import("./route");

const post = (body: unknown, cookie?: string) => POST(new Request("https://k-navi.vercel.app/api/track", {
  method: "POST",
  headers: { "user-agent": "UA", "x-forwarded-for": "1.2.3.4", ...(cookie ? { cookie } : {}) },
  body: typeof body === "string" ? body : JSON.stringify(body),
}));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("VERCEL_PROJECT_ID", "");
  vi.stubEnv("STORAGE_PRODUCT", "knavi");
  vi.stubEnv("KNAVI_INSTALLATION_ID", "mangwon-worldcup-market");
  vi.stubEnv("KNAVI_DATABASE_PROJECT_REF", "markettest");
  vi.stubEnv("KNAVI_SUPABASE_URL", "https://markettest.supabase.co");
  vi.stubEnv("KNAVI_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test_market");
  afterTasks.length = 0;
  trackRateBuckets.clear();
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  fetchMock = vi.fn().mockImplementation(async (url: string) => url.includes("/deployment_identity?")
    ? Response.json([{ product_id: "knavi", installation_id: "mangwon-worldcup-market" }]) : url.includes("ingest_id=eq.") ? Response.json([{ ingest_id: new URL(url).searchParams.get("ingest_id")!.slice(3) }]) : new Response(null, { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function insertedRow() {
  await afterTasks[0]!();
  const [url, init] = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(url).toBe(`${process.env.STORAGE_PRODUCT === "walk" ? "https://example.supabase.co" : "https://markettest.supabase.co"}/rest/v1/events`);
  return JSON.parse(init.body);
}

describe("POST /api/track", () => {
  it("accepts store 23 only on navigation events and computes store number on the server", async () => {
    const navigationId = "12345678-1234-4234-8234-123456789012";
    for (const event of ["nav_start", "nav_progress", "reroute", "arrive", "nav_stop", "route_error"]) {
      afterTasks.length = 0; fetchMock.mockClear();
      const response = await post({ event, store_id: "worldcup-market-23", store_no: 999, navigation_id: navigationId, error_type: "route_http" });
      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({ storage: "pending" });
      expect(await insertedRow()).toMatchObject({ store_id: "worldcup-market-23", store_no: 23, navigation_id: navigationId });
    }
    expect((await post({ event: "nav_start", store_id: "worldcup-market-99" })).status).toBe(400);
    expect((await post({ event: "nav_start", navigation_id: "forged" })).status).toBe(400);
  });
  it("never stores WALK coordinates without current consent and ignores claimed traffic class", async () => {
    vi.stubEnv("STORAGE_PRODUCT", "walk"); vi.stubEnv("VERCEL_ENV", ""); vi.stubEnv("ANALYTICS_TRAFFIC_TYPE", "");
    for (const consent of [undefined, false, "true"]) {
      afterTasks.length = 0; fetchMock.mockClear();
      await post({ event: "nav_start", lat: 37.55, lng: 126.91, geo_consent: consent, traffic_type: "production" });
      const row = await insertedRow(); expect(row.lat).toBeUndefined(); expect(row.lng).toBeUndefined(); expect(row.traffic_type).toBe("unknown");
    }
    afterTasks.length = 0; fetchMock.mockClear();
    vi.stubEnv("ANALYTICS_TRAFFIC_TYPE", "test");
    await post({ event: "nav_start", lat: 37.55, lng: 126.91, geo_consent: true });
    expect(await insertedRow()).toMatchObject({ lat: 37.55, geo_consent: true, traffic_type: "test", traffic_evidence: "server-test-setting" });
  });
  it("rejects a market event on WALK and refuses generic WALK fallback when installation config is absent", async () => {
    vi.stubEnv("STORAGE_PRODUCT","walk");
    expect((await post({event:"page_view",product_id:"knavi",installation_id:"mangwon-worldcup-market"})).status).toBe(409);
    expect(afterTasks).toHaveLength(0);
    vi.stubEnv("STORAGE_PRODUCT","knavi");vi.stubEnv("KNAVI_SUPABASE_URL","");
    expect((await post({event:"page_view"})).status).toBe(503);
    expect(afterTasks).toHaveLength(0);expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires location consent for navigation events on a K-Navi deployment", async () => {
    await post({event:"nav_start",lat:37.55,lng:126.91});
    const row=await insertedRow();expect(row.app).toBe("worldcup-market");expect(row.lat).toBeUndefined();
    afterTasks.length=0;fetchMock.mockClear();
    await post({event:"nav_start",lat:37.55,lng:126.91,geo_consent:true});
    expect(await insertedRow()).toMatchObject({app:"worldcup-market",product_id:"knavi",installation_id:"mangwon-worldcup-market",geo_consent:true,lat:37.55});
  });
  it("rejects unknown events, unknown stores, oversize bodies and store events without a store", async () => {
    expect((await post({ event: "purchase" })).status).toBe(400);
    expect((await post({ event: "page_view", store_id: "nope" })).status).toBe(400);
    expect((await post({ event: "store_view" })).status).toBe(400);
    expect((await post("x".repeat(3000))).status).toBe(413);
    expect(afterTasks).toHaveLength(0);
  });

  it("logs page_view with the existing ktrip_vid visitor id and no IP", async () => {
    const res = await post({ event: "page_view", locale: "ja", session_id: "sess-12345678", path: "/worldcup-market" }, "ktrip_vid=abcdef12-3456");
    expect(res.status).toBe(202);
    const row = await insertedRow();
    expect(row).toMatchObject({ event: "page_view", visitor_id: "abcdef12-3456", locale: "ja", session_id: "sess-12345678", path: "/worldcup-market", user_agent: "UA", store_id: null });
    expect(JSON.stringify(row)).not.toContain("1.2.3.4");
  });

  it("issues a visitor cookie when missing", async () => {
    const res = await post({ event: "page_view" });
    expect(res.headers.get("set-cookie")).toContain("ktrip_vid=");
  });

  it("attributes store_view to the QR landing cookie and dedupes per store for 3 minutes", async () => {
    const res = await post({ event: "store_view", store_id: "worldcup-market-23", src: "deeplink" }, "ktrip_vid=abcdef12-3456; ktrip_land=23");
    expect((await insertedRow())).toMatchObject({ event: "store_view", store_id: "worldcup-market-23", store_no: 23, src: "qr" });
    const cookies = res.headers.get("set-cookie") ?? "";
    expect(cookies).toMatch(/ktrip_sv_23=1; Path=\/api\/track; Expires=[^;]+; Max-Age=180/);
    expect(cookies).toContain("ktrip_land=;");
    afterTasks.length = 0;
    await post({ event: "store_view", store_id: "worldcup-market-23", src: "list" }, "ktrip_vid=abcdef12-3456; ktrip_sv_23=1");
    expect(afterTasks).toHaveLength(0);
  });

  it("keeps the client source when there is no QR landing and drops unknown sources", async () => {
    await post({ event: "store_view", store_id: "worldcup-market-05", src: "map" }, "ktrip_vid=abcdef12-3456");
    expect((await insertedRow()).src).toBe("map");
    afterTasks.length = 0; fetchMock.mockClear();
    await post({ event: "store_view", store_id: "worldcup-market-06", src: "evil" }, "ktrip_vid=abcdef12-3456");
    expect((await insertedRow()).src).toBeNull();
  });

  it("rate limits a visitor after 60 events per minute", async () => {
    for (let i = 0; i < 60; i += 1) await post({ event: "page_view" }, "ktrip_vid=abcdef12-3456");
    expect((await post({ event: "page_view" }, "ktrip_vid=abcdef12-3456")).status).toBe(429);
  });

  it("validates section_view sections and stores dwell_sec for store_leave", async () => {
    expect((await post({ event: "section_view", store_id: "worldcup-market-23", src: "footer" })).status).toBe(400);
    expect((await post({ event: "section_view", src: "menu" })).status).toBe(400);
    expect((await post({ event: "store_leave", store_id: "worldcup-market-23" })).status).toBe(400);
    expect((await post({ event: "store_leave", store_id: "worldcup-market-23", dwell_sec: -1 })).status).toBe(400);
    expect(afterTasks).toHaveLength(0);
    await post({ event: "section_view", store_id: "worldcup-market-23", src: "location" }, "ktrip_vid=abcdef12-3456");
    expect(await insertedRow()).toMatchObject({ event: "section_view", src: "location", store_no: 23, dwell_sec: null });
    afterTasks.length = 0; fetchMock.mockClear();
    await post({ event: "store_leave", store_id: "worldcup-market-23", dwell_sec: 999999.4 }, "ktrip_vid=abcdef12-3456");
    expect(await insertedRow()).toMatchObject({ event: "store_leave", dwell_sec: 86400 });
  });

  it("stores WALK events as app=walk with query length / error type only, no store", async () => {
    vi.stubEnv("STORAGE_PRODUCT", "walk");
    expect((await post({ event: "search", query_len: 5, src: "hit" })).status).toBe(202);
    const row = await insertedRow();
    expect(row).toMatchObject({ event: "search", app: "walk", query_len: 5, src: "hit", store_id: null });
    expect(JSON.stringify(row)).not.toContain("1.2.3.4");
    expect((await post({ event: "search" })).status).toBe(400);
    expect((await post({ event: "route_error", error_type: "bogus" })).status).toBe(400);
    expect((await post({ event: "search", query_len: 1, store_id: "worldcup-market-01" })).status).toBe(400);
  });
  it("keeps coordinates only on WALK nav events and drops them when WALK_STORE_COORDS=off", async () => {
    vi.stubEnv("STORAGE_PRODUCT", "walk");
    await post({ event: "nav_progress", geo_consent: true, lat: 37.55, lng: 126.91, accuracy_m: 8 });
    expect(await insertedRow()).toMatchObject({ app: "walk", lat: 37.55, lng: 126.91, accuracy_m: 8 });
    afterTasks.length = 0; fetchMock.mockClear();
    vi.stubEnv("STORAGE_PRODUCT", "knavi");
    await post({ event: "page_view", lat: 37.55, lng: 126.91 });
    const ktrip = await insertedRow();
    expect(ktrip.lat).toBeUndefined(); expect(ktrip.app).toBe("worldcup-market");
    afterTasks.length = 0; fetchMock.mockClear();
    vi.stubEnv("STORAGE_PRODUCT", "walk");
    vi.stubEnv("WALK_STORE_COORDS", "off");
    await post({ event: "arrive", lat: 37.55, lng: 126.91 });
    expect((await insertedRow()).lat).toBeUndefined();
  });
  it("worldcup-market: coordinates only with geo_consent on location_fix/store_view/map_pin_click; never IP", async () => {
    const reset = () => { afterTasks.length = 0; fetchMock.mockClear(); };
    await post({ event: "location_fix", src: "auto", lat: 37.5587, lng: 126.905, accuracy_m: 12, geo_consent: true });
    const row = await insertedRow();
    expect(row).toMatchObject({ app: "worldcup-market", event: "location_fix", src: "auto", lat: 37.5587, lng: 126.905, accuracy_m: 12, geo_consent: true });
    expect(JSON.stringify(row)).not.toContain("1.2.3.4");
    reset();
    // No consent: location_fix is not stored at all; other events drop coordinates.
    await post({ event: "location_fix", src: "auto", lat: 37.5587, lng: 126.905 });
    expect(afterTasks).toHaveLength(0);
    await post({ event: "map_pin_click", lat: 37.5587, lng: 126.905 });
    const noConsent = await insertedRow();
    expect(noConsent.lat).toBeUndefined(); expect(noConsent.geo_consent).toBeUndefined();
    reset();
    await post({ event: "page_view", lat: 37.5587, lng: 126.905, geo_consent: true });
    expect((await insertedRow()).lat).toBeUndefined();
    reset();
    vi.stubEnv("WCM_STORE_COORDS", "off");
    await post({ event: "map_pin_click", lat: 37.5587, lng: 126.905, geo_consent: true });
    expect((await insertedRow()).lat).toBeUndefined();
  });
});
