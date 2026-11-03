import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, adminAlias, adminConfigured, adminSession, checkAdminPassword, isAdmin } from "./adminAuth";
const req = (value: string) => new Request("https://example.test/api/admin/analytics", { headers: { cookie: `${ADMIN_COOKIE}=${value}` } });
beforeEach(() => { vi.stubEnv("ANALYTICS_ADMIN_PASSWORD", "test-only-administrator-password-0123456789"); });
afterEach(() => { vi.unstubAllEnvs(); });
describe("admin authentication", () => {
  it("accepts signed sessions and rejects forged, expired and rotated sessions", () => {
    const now = Date.now(), token = adminSession(now);
    expect(isAdmin(req(token), now)).toBe(true);
    expect(isAdmin(req(token + "x"), now)).toBe(false);
    expect(isAdmin(req(token), now + 28800001)).toBe(false);
    vi.stubEnv("ANALYTICS_ADMIN_PASSWORD", "different-administrator-password-0123456789");
    expect(isAdmin(req(token), now)).toBe(false);
  });
  it("requires a strong configured secret, never accepts missing credentials", () => {
    expect(checkAdminPassword("wrong")).toBe(false);
    expect(checkAdminPassword(undefined)).toBe(false);
    expect(checkAdminPassword(process.env.ANALYTICS_ADMIN_PASSWORD)).toBe(true);
    vi.stubEnv("ANALYTICS_ADMIN_PASSWORD", "short"); expect(adminConfigured()).toBe(false);
    expect(isAdmin(req(""))).toBe(false);
  });
  it("uses stable keyed pseudonyms without returning identifiers", () => {
    expect(adminAlias("visitor-123")).toBe(adminAlias("visitor-123"));
    expect(adminAlias("visitor-123")).not.toContain("visitor");
    expect(adminAlias(null)).toBeNull();
  });
});
