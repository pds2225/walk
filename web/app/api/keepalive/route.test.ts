import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const req = (auth?: string) => new Request("http://x/api/keepalive", { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("GET /api/keepalive", () => {
  it("rejects missing or wrong bearer", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
  });

  it("rejects everything when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
  });

  it("runs a real read on qr_scans", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await GET(req("Bearer s3cret"))).status).toBe(200);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://example.supabase.co/rest/v1/qr_scans?select=id&limit=1");
  });

  it("reports upstream failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    expect((await GET(req("Bearer s3cret"))).status).toBe(502);
  });
});
