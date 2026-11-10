/** Privacy-preserving store-level counts from existing K-TRIP funnel events. No GPS or visitor IDs leave this endpoint. */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseConfig } from "../../../../../lib/qrScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
const DAY_MS = MAX_WINDOW_MS;
const PAGE_SIZE = 1000;
const MAX_ROWS = 5000;
const MIN_VISITORS = 5;

type EventRow = { store_id: string; visitor_id: string };
function isRow(value: unknown): value is EventRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.store_id === "string" && /^worldcup-market-\d{2,3}$/.test(row.store_id)
    && typeof row.visitor_id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(row.visitor_id);
}

function authorized(header: string | null, key: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice(7), "utf8");
  const expected = Buffer.from(key, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store, private", "x-content-type-options": "nosniff" } });
}

export async function GET(request: Request) {
  if (process.env.POC_AGGREGATE_API_ENABLED !== "true") return json({ error: "not enabled" }, 503);
  const key = process.env.POC_LOCATION_API_KEY;
  const db = supabaseConfig();
  if (!key || !db) return json({ error: "not configured" }, 503);
  if (!authorized(request.headers.get("authorization"), key)) return json({ error: "unauthorized" }, 401);

  const params = new URL(request.url).searchParams;
  const from = params.get("from"), to = params.get("to");
  if (!from || !to || !ISO_RE.test(from) || !ISO_RE.test(to)) return json({ error: "ISO 8601 from/to required" }, 400);
  const start = Date.parse(from), end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== DAY_MS || start % DAY_MS !== 0 || end > Math.floor(Date.now() / DAY_MS) * DAY_MS) {
    return json({ error: "only completed UTC calendar days are supported" }, 400);
  }
  if ([...params.keys()].some(k => k !== "from" && k !== "to")) return json({ error: "unsupported filter" }, 400);

  const headers: Record<string, string> = { apikey: db.key, accept: "application/json" };
  if (db.key.startsWith("eyJ")) headers.authorization = "Bearer " + db.key;
  const grouped = new Map<string, { count: number; visitors: Set<string> }>();
  let processed = 0;
  try {
    for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
      const url = new URL(db.url + "/rest/v1/events");
      url.searchParams.set("select", "store_id,visitor_id");
      url.searchParams.set("app", "eq.worldcup-market");
      url.searchParams.set("event", "eq.store_view");
      url.searchParams.set("store_id", "not.is.null");
      url.searchParams.set("visitor_id", "not.is.null");
      url.searchParams.append("created_at", "gte." + new Date(start).toISOString());
      url.searchParams.append("created_at", "lt." + new Date(end).toISOString());
      url.searchParams.set("order", "id.asc");
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(offset));
      const response = await fetch(url.toString(), { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) return json({ error: "storage unavailable" }, 502);
      const rows: unknown = await response.json();
      if (!Array.isArray(rows) || rows.length > PAGE_SIZE || !rows.every(isRow)) return json({ error: "invalid storage response" }, 502);
      processed += rows.length;
      if (processed > MAX_ROWS) return json({ error: "data volume exceeds safe aggregation limit" }, 422);
      for (const row of rows) {
        let item = grouped.get(row.store_id);
        if (!item) { item = { count: 0, visitors: new Set() }; grouped.set(row.store_id, item); }
        item.count++;
        item.visitors.add(row.visitor_id);
      }
      if (rows.length < PAGE_SIZE) break;
    }
    const stores = [...grouped.entries()]
      .filter(([, item]) => item.visitors.size >= MIN_VISITORS)
      .map(([store_id, item]) => ({ store_id, unique_qr_or_web_visitors: Math.floor(item.visitors.size / MIN_VISITORS) * MIN_VISITORS, store_view_events: Math.floor(item.count / MIN_VISITORS) * MIN_VISITORS }))
      .sort((a, b) => a.store_id.localeCompare(b.store_id));
    return json({ from: new Date(start).toISOString(), to: new Date(end).toISOString(), metric: "store_view", minimum_group_size: MIN_VISITORS, stores });
  } catch {
    return json({ error: "storage unavailable" }, 502);
  }
}
