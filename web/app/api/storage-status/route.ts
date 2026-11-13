/**
 * Privacy-limited readback of this browser's own recently collected events.
 * Use after a real visit to confirm that asynchronous event writes reached Supabase.
 * Never return visitor IDs, session IDs, coordinates, event payloads or secrets.
 */
import { NextResponse } from "next/server";
import { supabaseConfig, VISITOR_COOKIE } from "../../../lib/qrScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_RE = /^[A-Za-z0-9-]{8,64}$/;
const LOOKBACK_MINUTES = 15;

function respond(payload: object, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      vary: "Cookie",
    },
  });
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const item of header.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("="); // Never echo the value.
  }
  return null;
}

export async function GET(request: Request) {
  const visitorId = cookieValue(request.headers.get("cookie"), VISITOR_COOKIE);
  if (!visitorId || !VISITOR_RE.test(visitorId)) {
    return respond({ ok: false, status: "visitor_cookie_missing" }, 400);
  }

  const db = supabaseConfig();
  if (!db) return respond({ ok: false, status: "storage_unconfigured" }, 503);

  const from = new Date(Date.now() - LOOKBACK_MINUTES * 60_000).toISOString();
  const headers: Record<string, string> = { apikey: db.key };
  // Legacy JWT service_role keys use Bearer; sb_secret_ keys use apikey only.
  if (db.key.startsWith("eyJ")) headers.authorization = `Bearer ${db.key}`;

  const recent = async (table: "events" | "qr_scans", timeField: "created_at" | "scanned_at") => {
    const url = new URL(`${db.url}/rest/v1/${table}`);
    url.searchParams.set("select", "id");
    url.searchParams.set("visitor_id", `eq.${visitorId}`);
    url.searchParams.set(timeField, `gte.${from}`);
    url.searchParams.set("limit", "1");

    const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("storage read failed");
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length > 1) throw new Error("storage read malformed");
    return rows.length === 1;
  };

  try {
    const [recentEventsSaved, recentQrScansSaved] = await Promise.all([
      recent("events", "created_at"),
      recent("qr_scans", "scanned_at"),
    ]);

    return respond({
      ok: true,
      status: "storage_connected",
      recent_events_saved: recentEventsSaved,
      recent_qr_scans_saved: recentQrScansSaved,
      lookback_minutes: LOOKBACK_MINUTES,
    }, 200);
  } catch {
    // Do not log tokens, URLs, visitor identifiers or returned rows.
    return respond({ ok: false, status: "storage_read_failed" }, 502);
  }
}
