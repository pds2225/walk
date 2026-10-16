/** Funnel event collector for K-TRIP (/worldcup-market, app=worldcup-market) and WALK (/, app=walk). Inserts into public.events server-side (never IP; coordinates only for WALK movement events and consented K-TRIP location events). */
import { after, NextResponse } from "next/server";
import { DETAIL_SECTIONS, isFunnelEvent, isWalkEvent, WALK_COORD_EVENTS, WALK_ERROR_TYPES, WALK_HOME_VIEW_COOKIE, WALK_HOME_VIEW_DEDUPE_SECONDS, WALK_SOURCES, WCM_COORD_EVENTS, WCM_LOCATION_SOURCES, MAX_DWELL_SECONDS, STORE_VIEW_COOKIE_PREFIX, STORE_VIEW_DEDUPE_SECONDS, STORE_VIEW_SOURCES } from "../../../lib/funnelEvents";
import { insertSupabaseRow, QR_LANDING_COOKIE, trackRateBuckets as buckets, storeIdFromQrNumber, storeNumberFromId, VISITOR_COOKIE } from "../../../lib/qrScan";
import { WORLD_CUP_MARKET_STORES } from "../../../lib/worldCupMarketStores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;
const RATE_LIMIT_PER_MINUTE = 60;
const KNOWN_STORES = new Set(WORLD_CUP_MARKET_STORES.map((store) => store.id));
const LOCALES = new Set(["ko", "en", "ja", "zh"]);
const VISITOR_RE = /^[A-Za-z0-9-]{8,64}$/;
const SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function limited(key: string, now: number): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start > 60_000) {
    buckets.set(key, { start: now, count: 1 });
    if (buckets.size > 10_000) buckets.clear();
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_PER_MINUTE;
}

const str = (value: unknown, max: number): string | null => (typeof value === "string" && value.length > 0 ? value.slice(0, max) : null);

export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) throw new Error("bad");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const event = body["event"];
  if (!isFunnelEvent(event)) return NextResponse.json({ ok: false, error: "unknown event" }, { status: 400 });
  const storeIdRaw = body["store_id"];
  const storeId = typeof storeIdRaw === "string" && KNOWN_STORES.has(storeIdRaw) ? storeIdRaw : null;
  if (storeIdRaw !== null && storeIdRaw !== undefined && !storeId) return NextResponse.json({ ok: false, error: "unknown store" }, { status: 400 });
  if ((event === "store_view" || event === "phone_click" || event === "section_view" || event === "store_leave") && !storeId) return NextResponse.json({ ok: false, error: "store required" }, { status: 400 });

  const cookies = request.headers.get("cookie");
  const existing = readCookie(cookies, VISITOR_COOKIE);
  const visitorId = existing && VISITOR_RE.test(existing) ? existing : crypto.randomUUID();
  const secure = new URL(request.url).protocol === "https:";
  const response = NextResponse.json({ ok: true }, { status: 202 });
  if (visitorId !== existing) {
    response.cookies.set(VISITOR_COOKIE, visitorId, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  if (limited(visitorId, Date.now())) return NextResponse.json({ ok: false }, { status: 429 });

  const walk = isWalkEvent(event);
  if (walk && storeId) return NextResponse.json({ ok: false, error: "store not allowed" }, { status: 400 });
  let src = str(body["src"], 16);
  let queryLen: number | null = null, errorType: string | null = null;
  let coords: { lat: number; lng: number; accuracy_m: number | null } | null = null;
  if (walk) {
    src = src && (WALK_SOURCES as readonly string[]).includes(src) ? src : null;
    if (event === "search") {
      const q = body["query_len"];
      if (typeof q !== "number" || !Number.isFinite(q) || q < 0) return NextResponse.json({ ok: false, error: "query_len required" }, { status: 400 });
      queryLen = Math.min(Math.round(q), 200);
    }
    if (event === "route_error") {
      const e = body["error_type"];
      if (!(typeof e === "string" && (WALK_ERROR_TYPES as readonly string[]).includes(e))) return NextResponse.json({ ok: false, error: "unknown error_type" }, { status: 400 });
      errorType = e;
    }
    const lat = body["lat"], lng = body["lng"], acc = body["accuracy_m"];
    if (process.env.WALK_STORE_COORDS !== "off" && (WALK_COORD_EVENTS as readonly string[]).includes(event)
      && typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      coords = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6,
        accuracy_m: typeof acc === "number" && Number.isFinite(acc) && acc >= 0 ? Math.min(Math.round(acc * 10) / 10, 100000) : null };
    }
    if (event === "home_view") {
      if (readCookie(cookies, WALK_HOME_VIEW_COOKIE)) return response; // same visitor within 3 min
      response.cookies.set(WALK_HOME_VIEW_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure, path: "/api/track", maxAge: WALK_HOME_VIEW_DEDUPE_SECONDS });
    }
  }
  let geoConsent = false;
  if (!walk) {
    if (event === "location_fix") src = src && (WCM_LOCATION_SOURCES as readonly string[]).includes(src) ? src : null;
    const lat = body["lat"], lng = body["lng"], acc = body["accuracy_m"];
    if (body["geo_consent"] === true && process.env.WCM_STORE_COORDS !== "off" && (WCM_COORD_EVENTS as readonly string[]).includes(event)
      && typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      geoConsent = true;
      coords = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6,
        accuracy_m: typeof acc === "number" && Number.isFinite(acc) && acc >= 0 ? Math.min(Math.round(acc * 10) / 10, 100000) : null };
    }
    if (event === "location_fix" && !coords) return response; // nothing to store without consent
  }
  if (event === "section_view" && !(src && (DETAIL_SECTIONS as readonly string[]).includes(src))) {
    return NextResponse.json({ ok: false, error: "unknown section" }, { status: 400 });
  }
  let dwellSec: number | null = null;
  if (event === "store_leave") {
    const raw = body["dwell_sec"];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return NextResponse.json({ ok: false, error: "dwell_sec required" }, { status: 400 });
    dwellSec = Math.min(Math.round(raw), MAX_DWELL_SECONDS);
  }
  if (event === "store_view" && storeId) {
    src = src && (STORE_VIEW_SOURCES as readonly string[]).includes(src) ? src : null;
    const landing = readCookie(cookies, QR_LANDING_COOKIE);
    if (landing && storeIdFromQrNumber(landing) === storeId) {
      src = "qr";
      response.cookies.set(QR_LANDING_COOKIE, "", { httpOnly: true, sameSite: "lax", secure, path: "/api/track", maxAge: 0 });
    }
    const dedupeName = `${STORE_VIEW_COOKIE_PREFIX}${storeNumberFromId(storeId)}`;
    if (readCookie(cookies, dedupeName)) return response; // same visitor+store within 3 min
    response.cookies.set(dedupeName, "1", { httpOnly: true, sameSite: "lax", secure, path: "/api/track", maxAge: STORE_VIEW_DEDUPE_SECONDS });
  }

  const locale = str(body["locale"], 8);
  const sessionId = str(body["session_id"], 64);
  const row = {
    event,
    store_id: storeId,
    store_no: storeId ? storeNumberFromId(storeId) : null,
    locale: locale && LOCALES.has(locale) ? locale : null,
    src,
    visitor_id: visitorId,
    session_id: sessionId && SESSION_RE.test(sessionId) ? sessionId : null,
    path: str(body["path"], 128),
    user_agent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
    dwell_sec: dwellSec,
    ...(walk ? { app: "walk", query_len: queryLen, error_type: errorType, ...(coords ?? {}) } : { app: "worldcup-market", ...(coords ? { ...coords, geo_consent: geoConsent } : {}) }),
  };
  after(async () => {
    await insertSupabaseRow("events", row);
  });
  return response;
}
