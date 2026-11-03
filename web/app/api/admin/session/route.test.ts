import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";
const password = "test-admin-password-at-least-thirty-two-characters";
const request = (value: unknown, origin = "https://app.test") => new Request("https://app.test/api/admin/session", { method: "POST", headers: { origin }, body: JSON.stringify({ password: value }) });
beforeEach(() => { vi.stubEnv("ANALYTICS_ADMIN_PASSWORD", password); });
afterEach(() => { vi.unstubAllEnvs(); });
describe("admin session API", () => {
  it("rejects foreign origins and incorrect credentials", async () => {
    expect((await POST(request(password, "https://foreign.test"))).status).toBe(403);
    expect((await POST(request("wrong"))).status).toBe(401);
  });
  it("sets a signed HttpOnly secure strict cookie and deletes it on logout", async () => {
    const response = await POST(request(password));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).toContain("SameSite=strict");
    expect(cookie).not.toContain(password);
    expect((await DELETE(request(""))).headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("reports unavailable configuration instead of allowing access", async () => {
    vi.stubEnv("ANALYTICS_ADMIN_PASSWORD", ""); expect((await POST(request(password))).status).toBe(503);
  });
});
