/** Read-only, explicitly enabled PoC export of consented World Cup Market location events. */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseConfig } from "../../../../../lib/qrScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_RE = /^[A-Za-z0-9-]{8,64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
const SELECT = "id,created_at,event,visitor_id,session_id,store_id,lat,lng,accuracy_m";

function authorized(header: string | null, key: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7), "utf8");
  const expected = Buffer.from(key, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request) {
  if (process.env.POC_LOCATION_API_ENABLED !== "true") {
    return NextResponse.json({ error: "not enabled" }, { status: 503 });
  }
  const key = process.env.POC_LOCATION_API_KEY;
  const db = supabaseConfig();
  if (!key || !db) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), key)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to || !ISO_RE.test(from) || !ISO_RE.test(to)) {
    return NextResponse.json({ error: "from and to must be ISO 8601 timestamps with timezone" }, { status: 400 });
  }
  const start = Date.parse(from), end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > MAX_WINDOW_MS || end > Date.now() + 60_000) {
    return NextResponse.json({ error: "invalid time window (maximum 24 hours)" }, { status: 400 });
  }
  const limitRaw = params.get("limit") ?? "100";
  const offsetRaw = params.get("offset") ?? "0";
  if (!/^\d{1,3}$/.test(limitRaw) || !/^\d{1,5}$/.test(offsetRaw)) {
    return NextResponse.json({ error: "invalid pagination" }, { status: 400 });
  }
  const limit = Number(limitRaw), offset = Number(offsetRaw);
  if (limit < 1 || limit > 100 || offset > 10000) {
    return NextResponse.json({ error: "pagination out of range" }, { status: 400 });
  }
  const visitorId = params.get("visitor_id");
  if (visitorId !== null && !VISITOR_RE.test(visitorId)) {
    return NextResponse.json({ error: "invalid visitor_id" }, { status: 400 });
  }

  const query = new URL(db.url + "/rest/v1/events");
  query.searchParams.set("select", SELECT);
  query.searchParams.set("app", "eq.worldcup-market");
  query.searchParams.set("geo_consent", "eq.true");
  query.searchParams.set("lat", "not.is.null");
  query.searchParams.set("lng", "not.is.null");
  query.searchParams.set("created_at", "gte." + new Date(start).toISOString());
  query.searchParams.append("created_at", "lt." + new Date(end).toISOString());
  query.searchParams.set("order", "created_at.asc,id.asc");
  query.searchParams.set("limit", String(limit));
  query.searchParams.set("offset", String(offset));
  if (visitorId) query.searchParams.set("visitor_id", "eq." + visitorId);

  try {
    const headers: Record<string, string> = { apikey: db.key, accept: "application/json" };
    if (db.key.startsWith("eyJ")) headers.authorization = "Bearer " + db.key;
    const response = await fetch(query.toString(), { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return NextResponse.json({ error: "storage unavailable" }, { status: 502 });
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) return NextResponse.json({ error: "invalid storage response" }, { status: 502 });
    return NextResponse.json({ records: rows, limit, offset, has_more: rows.length === limit }, {
      headers: { "cache-control": "no-store, private", "x-content-type-options": "nosniff" },
    });
  } catch {
    return NextResponse.json({ error: "storage unavailable" }, { status: 502 });
  }
}
