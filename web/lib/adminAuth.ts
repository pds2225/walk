import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
export const ADMIN_COOKIE = "walk_analytics_admin";
const MAX_AGE = 8 * 60 * 60;
function secret() { const value = process.env.ANALYTICS_ADMIN_PASSWORD; return value && value.length >= 32 ? value : null; }
export function adminConfigured() { return secret() !== null; }
function equal(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
export function checkAdminPassword(value: unknown) { const key = secret(); return !!key && typeof value === "string" && equal(value, key); }
function sign(value: string, key: string) { return createHmac("sha256", key).update(value).digest("hex"); }
export function adminSession(now = Date.now()) {
  const key = secret(); if (!key) throw new Error("admin not configured");
  const payload = `${Math.floor(now / 1000) + MAX_AGE}.${randomUUID()}`;
  return `${payload}.${sign(payload, key)}`;
}
export function isAdmin(request: Request, now = Date.now()) {
  const key = secret(); if (!key) return false;
  const cookie = request.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
  if (!cookie || cookie.length > 180) return false;
  const [expiry, nonce, signature, extra] = cookie.split(".");
  const expires = Number(expiry), current = Math.floor(now / 1000);
  if (extra || !nonce || !signature || !Number.isInteger(expires) || expires <= current || expires > current + MAX_AGE) return false;
  return equal(signature, sign(`${expiry}.${nonce}`, key));
}
export function sameOrigin(request: Request) { return request.headers.get("origin") === new URL(request.url).origin; }
export function adminAlias(raw: unknown) {
  const key = secret(); return key && typeof raw === "string" && raw ? createHmac("sha256", key).update(raw).digest("hex").slice(0, 16) : null;
}
/** 비밀·IP·조회 내용을 제외하고 작업과 허용/거부 결과만 플랫폼 감사 로그에 남긴다. */
export function auditAdmin(action: string, result: "allowed" | "denied" | "error") {
  console.info(JSON.stringify({ type: "analytics_admin_audit", action, result, at: new Date().toISOString() }));
}
