import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
let fetchMock: ReturnType<typeof vi.fn>;
const url = "https://k-navi.vercel.app/api/aihows-consent";
const post = (action: string, cookie = "ktrip_vid=visitor-00000001", origin = "https://k-navi.vercel.app") => POST(new Request(url, {
  method: "POST", headers: { "content-type": "application/json", cookie, origin },
  body: JSON.stringify({ action, notice_version: "aihows-poc-2026-11-v1" }),
}));
beforeEach(() => {
  vi.stubEnv("AIHOWS_LEGAL_NAME", "AIHows Verified Corporation");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("AIHows third-party consent", () => {
  it("blocks consent when the verified legal recipient is not configured", async () => {
    vi.stubEnv("AIHOWS_LEGAL_NAME", "");
    expect((await post("grant")).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests", async () => {
    expect((await post("grant", undefined, "https://attacker.example")).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("records separate consent and an audit entry using the server cookie", async () => {
    expect((await post("grant")).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const row = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(row.visitor_id).toBe("visitor-00000001");
    expect(row.notice_version).toBe("aihows-poc-2026-11-v1");
    expect(row.granted_at).toBeTruthy();
    expect(row.revoked_at).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toContain("aihows_location_consent_audit");
  });
  it("revokes consent and logs the action", async () => {
    expect((await post("revoke")).status).toBe(200);
    const row = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(row.granted_at).toBeNull();
    expect(row.revoked_at).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).action).toBe("revoke");
  });
  it("fails closed when the DB is not available", async () => {
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 500 }));
    expect((await post("grant")).status).toBe(503);
  });
  it("GET does not invent consent without a cookie", async () => {
    const r = await GET(new Request(url));
    expect((await r.json()).consented).toBe(false);
  });
});
