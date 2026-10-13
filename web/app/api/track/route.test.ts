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
  afterTasks.length = 0;
  trackRateBuckets.clear();
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function insertedRow() {
  await afterTasks[0]!();
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe("https://example.supabase.co/rest/v1/events");
  return JSON.parse(init.body);
}

describe("POST /api/track", () => {
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
});
