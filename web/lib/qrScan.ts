/**
 * Server-side QR scan logging for printed store QR codes (/q/<NN>).
 * The destination mapping lives here so it can change without reprinting.
 */
import { WORLD_CUP_MARKET_STORES } from "./worldCupMarketStores";
import { localeFromBrowserLanguages } from "./localePreference";
import { bindStorageRow, resolveStorageTarget, storageHeaders, verifyStorageIdentity } from "./storageDeployment";
import { recordStorageResult } from "./analyticsDiagnostics";

export const VISITOR_COOKIE = "ktrip_vid";
export const DEDUPE_COOKIE_PREFIX = "ktrip_qr_";
export const QR_DEDUPE_WINDOW_SECONDS = 3 * 60;

const KNOWN_IDS = new Set(WORLD_CUP_MARKET_STORES.map((store) => store.id));

/** "23" | "023" -> "worldcup-market-23" if that store exists. */
export function storeIdFromQrNumber(raw: string): string | null {
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  const id = `worldcup-market-${String(n).padStart(2, "0")}`;
  return KNOWN_IDS.has(id) ? id : null;
}

/** Where a scanned QR lands. Change here, not on the printed code. */
export function qrDestinationPath(storeId: string): string {
  return `/worldcup-market?store=${encodeURIComponent(storeId)}`;
}

export function storeNumberFromId(storeId: string): number | null {
  const match = /-(\d+)$/.exec(storeId);
  return match ? Number(match[1]) : null;
}

export function localeFromAcceptLanguage(header: string | null): string | null {
  if (!header) return null;
  const languages = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag ?? "", q: q ? Number(q.slice(2)) || 0 : 1 };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
  return localeFromBrowserLanguages(languages);
}

export interface QrScanRow {
  readonly store_id: string;
  readonly store_no: number | null;
  readonly locale: string | null;
  readonly src: string;
  readonly user_agent: string | null;
  readonly referrer: string | null;
  readonly visitor_id: string | null;
  readonly is_first_visit: boolean | null;
}

function supabaseHeaders(key: string): Record<string, string> {
  return storageHeaders(key);
}

export function supabaseConfig() {
  return resolveStorageTarget();
}

/** Inserts one row into public.qr_scans. Never throws; returns false on any failure. */
export async function insertQrScan(row: QrScanRow): Promise<boolean> {
  if (supabaseConfig()?.identity.productId !== "knavi") return false;
  return insertSupabaseRow("qr_scans", row);
}

/** Cookie set by /q/<NN> so the following store_view can be attributed to the QR scan. */
export const QR_LANDING_COOKIE = "ktrip_land";

/** Server-side REST insert with the service key. Never throws. */
export async function insertSupabaseRow(table: "qr_scans" | "events", row: object): Promise<boolean> {
  const config = supabaseConfig();
  if (!config) return false;
  if (config.identity.productId === "walk" && (table !== "events" || !("app" in row) || row.app !== "walk")) return false;
  const writeRow = { ...row, ingest_id: "ingest_id" in row && typeof row.ingest_id === "string" ? row.ingest_id : crypto.randomUUID() };
  try {
    if (!await verifyStorageIdentity(config)) { recordStorageResult(false); return false; }
    const res = await fetch(`${config.url}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...supabaseHeaders(config.key), "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify(bindStorageRow(config, table, writeRow)),
      signal: AbortSignal.timeout(5000),
    });
    let confirmed = res.ok;
    if (confirmed) {
      const check = await fetch(`${config.url}/rest/v1/${table}?select=ingest_id&ingest_id=eq.${encodeURIComponent(writeRow.ingest_id)}&limit=1`, {
        headers: supabaseHeaders(config.key), cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      const rows: unknown = check.ok ? await check.json() : null;
      confirmed = Array.isArray(rows) && rows.length === 1 && rows[0]?.ingest_id === writeRow.ingest_id;
    }
    recordStorageResult(confirmed);
    return confirmed;
  } catch {
    recordStorageResult(false);
    return false;
  }
}

/** Real DB read used by the keep-alive cron. */
export async function pingQrScans(): Promise<"ok" | "unconfigured" | "error"> {
  const config = supabaseConfig();
  if (!config) return "unconfigured";
  try {
    if (!await verifyStorageIdentity(config)) return "error";
    const res = await fetch(`${config.url}/rest/v1/qr_scans?select=id&limit=1`, {
      headers: supabaseHeaders(config.key),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

/** Best-effort per-instance rate-limit buckets for /api/track (visitor id -> window). */
export const trackRateBuckets = new Map<string, { start: number; count: number }>();
