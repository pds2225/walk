/** Funnel event collector for /worldcup-market. Inserts into public.events server-side (no IP). */
import { after, NextResponse } from "next/server";
import { DETAIL_SECTIONS, isFunnelEvent, MAX_DWELL_SECONDS, STORE_VIEW_COOKIE_PREFIX, STORE_VIEW_DEDUPE_SECONDS, STORE_VIEW_SOURCES } from "../../../lib/funnelEvents";
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

  let src = str(body["src"], 16);
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
  };
  after(async () => {
    await insertSupabaseRow("events", row);
  });
  return response;
}
