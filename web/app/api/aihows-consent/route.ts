import { NextResponse } from "next/server";
import { supabaseConfig, VISITOR_COOKIE } from "../../../../lib/qrScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const VERSION = "aihows-poc-2026-11-v1";
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const headers = (key: string) => ({ apikey: key, ...(key.startsWith("eyJ") ? { authorization: "Bearer " + key } : {}), "content-type": "application/json" });
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
function visitor(request: Request) {
  const raw = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(VISITOR_COOKIE + "="))?.slice(VISITOR_COOKIE.length + 1);
  return raw && ID_RE.test(raw) ? raw : null;
}
function configured() {
  const legalName = process.env.AIHOWS_LEGAL_NAME?.trim();
  return legalName && legalName.length > 3 ? legalName : null;
}
export async function GET(request: Request) {
  const legalName = configured();
  const db = supabaseConfig();
  const id = visitor(request);
  if (!legalName || !db) return json({ available: false, consented: false, notice_version: VERSION });
  if (!id) return json({ available: true, consented: false, recipient: legalName, notice_version: VERSION });
  try {
    const u = new URL(db.url + "/rest/v1/aihows_location_consents");
    u.searchParams.set("select", "granted_at,revoked_at,notice_version,recipient_legal_name");
    u.searchParams.set("visitor_id", "eq." + id);
    u.searchParams.set("limit", "1");
    const r = await fetch(u.toString(), { headers: headers(db.key), cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!r.ok) return json({ available: false, consented: false }, 503);
    const rows: unknown = await r.json();
    if (!Array.isArray(rows)) return json({ available: false, consented: false }, 503);
    const entry = rows[0] as Record<string, unknown> | undefined;
    return json({ available: true, consented: Boolean(entry?.granted_at && !entry?.revoked_at && entry?.notice_version === VERSION && entry?.recipient_legal_name === legalName), recipient: legalName, notice_version: VERSION });
  } catch { return json({ available: false, consented: false }, 503); }
}
export async function POST(request: Request) {
  const db = supabaseConfig();
  const legalName = configured();
  if (!db || !legalName) return json({ error: "not configured" }, 503);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "origin mismatch" }, 403);
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/json")) return json({ error: "JSON required" }, 415);
  const raw = await request.text();
  if (raw.length > 512) return json({ error: "invalid request" }, 400);
  let action: unknown, noticeVersion: unknown;
  try { ({ action, notice_version: noticeVersion } = JSON.parse(raw)); } catch { return json({ error: "invalid JSON" }, 400); }
  if (action !== "grant" && action !== "revoke") return json({ error: "invalid action" }, 400);
  if (action === "grant" && noticeVersion !== VERSION) return json({ error: "notice version mismatch" }, 400);
  const id = visitor(request) ?? (action === "grant" ? crypto.randomUUID() : null);
  if (!id) return json({ error: "no visitor consent" }, 400);
  try {
    const now = new Date().toISOString();
    const row = { visitor_id: id, granted_at: action === "grant" ? now : null, revoked_at: action === "revoke" ? now : null, notice_version: VERSION, recipient_legal_name: legalName, updated_at: now };
    const u = new URL(db.url + "/rest/v1/aihows_location_consents");
    u.searchParams.set("on_conflict", "visitor_id");
    const r = await fetch(u.toString(), { method: "POST", headers: { ...headers(db.key), prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row), signal: AbortSignal.timeout(5000) });
    if (!r.ok) return json({ error: "storage unavailable" }, 503);
    const audit = await fetch(db.url + "/rest/v1/aihows_location_consent_audit", { method: "POST", headers: { ...headers(db.key), prefer: "return=minimal" }, body: JSON.stringify({ visitor_id: id, action, notice_version: VERSION }), signal: AbortSignal.timeout(5000) });
    if (!audit.ok) {
      // The consent state was written but audit failed. Block further disclosure until repaired.
      if (action === "grant") {
        await fetch(u.toString(), { method: "POST", headers: { ...headers(db.key), prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ ...row, granted_at: null, revoked_at: new Date().toISOString() }), signal: AbortSignal.timeout(5000) }).catch(() => undefined);
      }
      return json({ error: "audit unavailable" }, 503);
    }
    const response = json({ ok: true, consented: action === "grant" });
    if (action === "grant" && !visitor(request)) response.cookies.set(VISITOR_COOKIE, id, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: 365 * 86400 });
    return response;
  } catch { return json({ error: "storage unavailable" }, 503); }
}
