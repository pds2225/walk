import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const afterTasks: Array<() => Promise<void>> = [];
vi.mock("next/server", async (orig) => {
  const actual = await orig<typeof import("next/server")>();
  return { ...actual, after: (fn: () => Promise<void>) => { afterTasks.push(fn); } };
});

const { GET } = await import("./route");

const call = (no: string, headers: Record<string, string> = {}) =>
  GET(new Request(`https://k-navi.vercel.app/q/${no}`, { headers }), { params: Promise.resolve({ no }) });

beforeEach(() => {
  afterTasks.length = 0;
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("GET /q/[no]", () => {
  it("302s to the store and logs one row without IP", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call("23", { "accept-language": "ja-JP,ja;q=0.9", "user-agent": "UA", "x-forwarded-for": "1.2.3.4" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://k-navi.vercel.app/worldcup-market?store=worldcup-market-23");
    expect(res.headers.get("set-cookie")).toContain("ktrip_vid=");
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]!();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.supabase.co/rest/v1/qr_scans");
    const row = JSON.parse(init.body);
    expect(row).toMatchObject({ store_id: "worldcup-market-23", store_no: 23, locale: "ja", src: "qr", user_agent: "UA", is_first_visit: true });
    expect(JSON.stringify(row)).not.toContain("1.2.3.4");
  });

  it("skips logging inside the 30 min dedupe window and keeps the visitor id", async () => {
    const res = await call("5", { cookie: "ktrip_vid=abcdef12-3456; ktrip_qr_5=1" });
    expect(res.status).toBe(302);
    expect(afterTasks).toHaveLength(0);
  });

  it("marks returning visitors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await call("5", { cookie: "ktrip_vid=abcdef12-3456" });
    await afterTasks[0]!();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ visitor_id: "abcdef12-3456", is_first_visit: false });
  });

  it("sends unknown numbers to the market list without logging", async () => {
    const res = await call("99");
    expect(res.headers.get("location")).toBe("https://k-navi.vercel.app/worldcup-market");
    expect(afterTasks).toHaveLength(0);
  });

  it("still redirects when Supabase is not configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    const res = await call("1");
    expect(res.status).toBe(302);
    await expect(afterTasks[0]!()).resolves.toBeUndefined();
  });
});
