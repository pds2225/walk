/** AIHows-only read access to the DB consent-gated view. Never query public.events directly. */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseConfig } from "../../../../../lib/qrScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store, private" } });
function equal(a: string | null, b: string): boolean {
  if (!a?.startsWith("Bearer ")) return false;
  const x = Buffer.from(a.slice(7)), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function GET(request: Request) {
  if (process.env.AIHOWS_GPS_API_ENABLED !== "true") return json({ error: "not enabled" }, 503);
  const key = process.env.AIHOWS_GPS_API_KEY;
  const legalName = process.env.AIHOWS_LEGAL_NAME?.trim();
  const db = supabaseConfig();
  if (!key || !legalName || !db) return json({ error: "not configured" }, 503);
  if (!equal(request.headers.get("authorization"), key)) return json({ error: "unauthorized" }, 401);
  const p = new URL(request.url).searchParams;
  if ([...p.keys()].some(k => !["from", "to", "limit"].includes(k))) return json({ error: "invalid filter" }, 400);
  const from = p.get("from"), to = p.get("to");
  if (!from || !to || !ISO.test(from) || !ISO.test(to)) return json({ error: "ISO 8601 timestamps required" }, 400);
  const start = Date.parse(from), end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 86400000 || end > Date.now()) return json({ error: "invalid time window" }, 400);
  const limitRaw = p.get("limit") ?? "100";
  if (!/^\d{1,3}$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > 100) return json({ error: "invalid limit" }, 400);
  const url = new URL(db.url + "/rest/v1/aihows_shareable_location_events");
  url.searchParams.set("select", "created_at,event,visitor_id,store_id,lat,lng,accuracy_m");
  url.searchParams.set("recipient_legal_name", "eq." + legalName);
  url.searchParams.set("notice_version", "eq.aihows-poc-2026-11-v1");
  url.searchParams.append("created_at", "gte." + new Date(start).toISOString());
  url.searchParams.append("created_at", "lt." + new Date(end).toISOString());
  url.searchParams.set("order", "created_at.asc");
  url.searchParams.set("limit", String(Number(limitRaw)));
  try {
    const headers: Record<string, string> = { apikey: db.key, accept: "application/json" };
    if (db.key.startsWith("eyJ")) headers.authorization = "Bearer " + db.key;
    const r = await fetch(url.toString(), { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return json({ error: "storage unavailable" }, 502);
    const rows: unknown = await r.json();
    if (!Array.isArray(rows)) return json({ error: "invalid storage response" }, 502);
    return json({ records: rows, limit: Number(limitRaw) });
  } catch { return json({ error: "storage unavailable" }, 502); }
}
