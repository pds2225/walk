import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminConfigured, adminSession, auditAdmin, checkAdminPassword, sameOrigin } from "../../../../lib/adminAuth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let attempts = { since: 0, count: 0 };
const json = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json("origin rejected", 403);
  if (!adminConfigured()) return json("administrator not configured", 503);
  if (Date.now() - attempts.since > 60_000) attempts = { since: Date.now(), count: 0 };
  if (++attempts.count > 10) return json("try later", 429);
  const raw = await request.text();
  if (raw.length > 1024) return json("body too large", 413);
  let password: unknown;
  try { password = (JSON.parse(raw) as { password?: unknown }).password; } catch { return json("invalid body", 400); }
  if (!checkAdminPassword(password)) { auditAdmin("login", "denied"); return json("invalid credentials", 401); }
  auditAdmin("login", "allowed");
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(ADMIN_COOKIE, adminSession(), { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict", path: "/api/admin", maxAge: 28800 });
  return response;
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json("origin rejected", 403);
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict", path: "/api/admin", maxAge: 0 });
  auditAdmin("logout", "allowed");
  return response;
}
