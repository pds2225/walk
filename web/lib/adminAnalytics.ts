import { adminAlias } from "./adminAuth";
import { resolveStorageTarget, storageHeaders, verifyStorageIdentity } from "./storageDeployment";
import { analyticsDiagnostics } from "./analyticsDiagnostics";

type Row = Record<string, unknown>;
export const ANALYTICS_LIMIT = 10000;
export function analyticsFilters(params: URLSearchParams, now = new Date()) {
  const defaultEnd = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const start = params.get("from") ?? new Date(now.getTime() - 29 * 86400000 + 9 * 3600000).toISOString().slice(0, 10);
  const end = params.get("to") ?? defaultEnd;
  const date = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  if (!date(start) || !date(end)) throw new Error("날짜 형식 오류");
  const since = new Date(`${start}T00:00:00+09:00`), until = new Date(new Date(`${end}T00:00:00+09:00`).getTime() + 86400000);
  if (until <= since || until.getTime() - since.getTime() > 93 * 86400000) throw new Error("조회 기간은 1~93일입니다");
  const app = params.get("app") ?? "all", traffic = params.get("traffic") ?? "all";
  const store = params.get("store") ?? "", q = params.get("q") ?? "";
  const space = params.get("space") ?? "all";
  const sort = params.get("sort") ?? "created_at", direction = params.get("direction") ?? "desc";
  const page = Number(params.get("page") ?? 1);
  if (!["all", "walk", "worldcup-market"].includes(app) || !["all", "production", "test", "unknown"].includes(traffic)
    || (store && !/^worldcup-market-(0[1-9]|[1-3][0-9]|4[0-5])$/.test(store))
    || !["all", "mangwon-worldcup-market", "general"].includes(space)
    || q.length > 64 || !/^[a-zA-Z0-9_-]*$/.test(q)
    || !["created_at", "event", "store_no"].includes(sort) || !["asc", "desc"].includes(direction)
    || !Number.isInteger(page) || page < 1 || page > 200) throw new Error("필터 형식 오류");
  return { from: start, to: end, since: since.toISOString(), until: new Date(Math.min(until.getTime(), now.getTime())).toISOString(), app, traffic, store, q, space, sort, direction, page };
}
export type AnalyticsFilters = ReturnType<typeof analyticsFilters>;

async function tableRows(table: "events" | "qr_scans", filters: AnalyticsFilters) {
  const target = resolveStorageTarget();
  if (!target) throw new Error("STORAGE_UNCONFIGURED");
  if (!await verifyStorageIdentity(target)) throw new Error("STORAGE_IDENTITY_UNVERIFIED");
  const time = table === "events" ? "created_at" : "scanned_at";
  // 원시 좌표/UA/검색어/리퍼러는 DB 요청 단계부터 선택하지 않는다.
  const select = table === "events"
    ? "id,created_at,app,event,store_id,store_no,locale,src,dwell_sec,visitor_id,session_id,navigation_id,traffic_type,traffic_evidence,ingest_id"
    : "id,scanned_at,store_id,store_no,locale,src,visitor_id,traffic_type,traffic_evidence,ingest_id";
  const query = new URLSearchParams({ select, order: `${time}.desc,id.desc` });
  query.append(time, `gte.${filters.since}`); query.append(time, `lt.${filters.until}`);
  if (table === "events" && filters.app !== "all") query.set("app", `eq.${filters.app}`);
  if (filters.store) query.set("store_id", `eq.${filters.store}`);
  if (filters.traffic === "unknown") query.set("or", "(traffic_type.is.null,traffic_type.eq.unknown)");
  else if (filters.traffic !== "all") query.set("traffic_type", `eq.${filters.traffic}`);
  if (table === "qr_scans" && filters.app === "walk") return [];
  const all: Row[] = [];
  for (let offset = 0; offset <= ANALYTICS_LIMIT; offset += 1000) {
    const response = await fetch(`${target.url}/rest/v1/${table}?${query}`, {
      headers: { ...storageHeaders(target.key), Range: `${offset}-${offset + 999}`, Prefer: "count=exact" },
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("DATABASE_READ_FAILED_OR_SCHEMA_MISSING");
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error("INVALID_DATABASE_RESPONSE");
    const total = Number(response.headers.get("content-range")?.split("/")[1]);
    if (total > ANALYTICS_LIMIT || all.length + rows.length > ANALYTICS_LIMIT) throw new Error("QUERY_TOO_LARGE_NARROW_FILTERS");
    for (const raw of rows as Row[]) {
      const { visitor_id, session_id, ...safe } = raw;
      all.push({ ...safe, created_at: raw[time], app: table === "qr_scans" ? "worldcup-market" : raw.app,
        event: table === "qr_scans" ? "qr_link_request" : raw.event,
        visitor_alias: adminAlias(visitor_id), session_alias: adminAlias(session_id),
        traffic_type: raw.traffic_type ?? "unknown", table });
    }
    if (rows.length < 1000 || (Number.isFinite(total) && total <= all.length)) break;
  }
  return all;
}
const text = (value: unknown) => typeof value === "string" ? value : "";
export function summarizeAnalytics(rows: Row[]) {
  const events = (event: string) => rows.filter((r) => r.event === event);
  const unique = (list: Row[], field: string) => new Set(list.map((r) => text(r[field])).filter(Boolean)).size;
  const starts = events("nav_start"), arrivals = events("arrive");
  // ID가 없는 과거 이벤트를 같은 보행으로 복원하지 않는다.
  const key = (r: Row) => r.navigation_id ? `${r.app}|${r.navigation_id}|${r.store_id ?? ""}` : null;
  const startKeys = new Set(starts.map(key).filter((k): k is string => !!k));
  const matchedArrivals = new Set(arrivals.map(key).filter((k): k is string => !!k && startKeys.has(k)));
  const days = new Map<string, number>();
  const stores = new Map<string, Record<string, number | string>>();
  for (const row of rows) {
    const timestamp = Date.parse(text(row.created_at));
    if (Number.isFinite(timestamp)) { const day = new Date(timestamp + 9 * 3600000).toISOString().slice(0, 10); days.set(day, (days.get(day) ?? 0) + 1); }
    const store = text(row.store_id);
    if (store) {
      const item = stores.get(store) ?? { store_id: store, qr_link_request: 0, qr_landing: 0, store_view: 0, directions: 0, nav_start: 0, arrive: 0 };
      const name = text(row.event);
      if (name in item && name !== "store_id") item[name] = Number(item[name]) + 1;
      if (name === "store_view" && row.src === "qr") item.qr_landing = Number(item.qr_landing) + 1;
      stores.set(store, item);
    }
  }
  return { eventCount: rows.length, visitors: unique(rows, "visitor_alias"), sessions: unique(rows, "session_alias"),
    navStartEvents: starts.length, arrivalEvents: arrivals.length, reroutes: events("reroute").length,
    identifiedNavigations: startKeys.size, matchedArrivalNavigations: matchedArrivals.size,
    eventArrivalRatio: startKeys.size ? matchedArrivals.size / startKeys.size : null,
    verifiedVisits: null, unknownTraffic: rows.filter((r) => r.traffic_type === "unknown" || r.traffic_type == null).length,
    missingNavigationIds: rows.filter((r) => ["nav_start", "nav_progress", "reroute", "arrive", "nav_stop"].includes(text(r.event)) && !r.navigation_id).length,
    duplicateStartEvents: starts.filter((r) => r.navigation_id).length - startKeys.size,
    arrivalWithoutStart: arrivals.filter((r) => !key(r) || !startKeys.has(key(r)!)).length,
    daily: [...days].sort().map(([date, count]) => ({ date, count })), stores: [...stores.values()],
    notes: ["production은 배포 출처이며 실사용·현장 방문 증명이 아닙니다.", "도착 이벤트는 현장 도착·구매 증명이 아닙니다.", "QR 링크 요청은 카메라 스캔·현장 방문 증명이 아닙니다.", "QR 랜딩은 src=qr인 점포조회입니다. 연결키 없는 전환율은 계산하지 않습니다.", "조회 기간 밖 시작·누락 ID·중복 별칭을 실제 사람 수로 복원하지 않습니다."] };
}
export function analyticsCsv(rows: Row[]) {
  const columns = ["created_at_utc", "created_at_kst", "app", "event", "store_id", "store_no", "locale", "src", "dwell_sec", "visitor_alias", "session_alias", "navigation_id", "traffic_type", "traffic_evidence", "ingest_id"];
  const cell = (v: unknown) => { let s = v == null ? "" : String(v); if (/^[\s]*[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  return "\uFEFF" + [columns.join(","), ...rows.map((row) => {
    const at = new Date(text(row.created_at));
    const normalized = { ...row, created_at_utc: at.toISOString(), created_at_kst: new Date(at.getTime() + 9 * 3600000).toISOString().replace("Z", "+09:00") };
    return columns.map((column) => cell(normalized[column as keyof typeof normalized])).join(",");
  })].join("\r\n");
}
export async function loadAnalytics(filters: AnalyticsFilters) {
  const rows = [...await tableRows("events", filters), ...await tableRows("qr_scans", filters)]
    .filter((r) => (filters.space === "all" || (filters.space === "general" ? r.app === "walk" && !r.store_id : r.app === "worldcup-market" || !!r.store_id))
      && (!filters.q || text(r.event).includes(filters.q) || text(r.store_id).includes(filters.q)));
  if (rows.length > ANALYTICS_LIMIT) throw new Error("QUERY_TOO_LARGE_NARROW_FILTERS");
  rows.sort((a, b) => String(a[filters.sort] ?? "").localeCompare(String(b[filters.sort] ?? ""), "en", { numeric: true }) * (filters.direction === "asc" ? 1 : -1));
  return { rows, summary: summarizeAnalytics(rows), diagnostics: { scope: "current-server-instance-only", ...analyticsDiagnostics, databaseReadback: "read-success", legacyClassification: "unknown" } };
}
