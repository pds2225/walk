/**
 * Printed store QR target: /q/<NN>. Logs the scan server-side (no IP) and
 * 302-redirects to the store detail. Unknown numbers go to the market list.
 */
import { after, NextResponse } from "next/server";
import {
  DEDUPE_COOKIE_PREFIX,
  QR_LANDING_COOKIE,
  QR_DEDUPE_WINDOW_SECONDS,
  VISITOR_COOKIE,
  insertQrScan,
  localeFromAcceptLanguage,
  qrDestinationPath,
  storeIdFromQrNumber,
  storeNumberFromId,
} from "../../../lib/qrScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

const VISITOR_RE = /^[A-Za-z0-9-]{8,64}$/;

export async function GET(request: Request, context: { params: Promise<{ no: string }> }) {
  const { no } = await context.params;
  const storeId = storeIdFromQrNumber(no);
  const target = new URL(storeId ? qrDestinationPath(storeId) : "/worldcup-market", request.url);
  const response = NextResponse.redirect(target, 302);
  response.headers.set("cache-control", "no-store");
  if (!storeId) return response;

  const cookies = request.headers.get("cookie");
  const existing = readCookie(cookies, VISITOR_COOKIE);
  const visitorId = existing && VISITOR_RE.test(existing) ? existing : crypto.randomUUID();
  const secure = new URL(request.url).protocol === "https:";
  response.cookies.set(VISITOR_COOKIE, visitorId, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 365 });

  // Lets /api/track attribute the next store_view of this store to the QR scan.
  response.cookies.set(QR_LANDING_COOKIE, String(storeNumberFromId(storeId)), { httpOnly: true, sameSite: "lax", secure, path: "/api/track", maxAge: 300 });

  const dedupeName = `${DEDUPE_COOKIE_PREFIX}${storeNumberFromId(storeId)}`;
  if (readCookie(cookies, dedupeName)) return response; // same visitor+store within 10 min
  response.cookies.set(dedupeName, "1", { httpOnly: true, sameSite: "lax", secure, path: "/q", maxAge: QR_DEDUPE_WINDOW_SECONDS });

  const row = {
    store_id: storeId,
    store_no: storeNumberFromId(storeId),
    locale: localeFromAcceptLanguage(request.headers.get("accept-language")),
    src: "qr",
    user_agent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
    referrer: request.headers.get("referer")?.slice(0, 512) ?? null,
    visitor_id: visitorId,
    is_first_visit: !(existing && VISITOR_RE.test(existing)),
  };
  // Log after the redirect is sent so scanning never waits on the database.
  after(async () => {
    await insertQrScan(row);
  });
  return response;
}
