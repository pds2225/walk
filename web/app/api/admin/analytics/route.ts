import { NextResponse } from "next/server";
import { auditAdmin, isAdmin } from "../../../../lib/adminAuth";
import { analyticsCsv, analyticsFilters, loadAnalytics } from "../../../../lib/adminAnalytics";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store, private", "x-content-type-options": "nosniff" };
export async function GET(request: Request) {
  if (!isAdmin(request)) { auditAdmin("read", "denied"); return NextResponse.json({ error: "unauthorized" }, { status: 401, headers }); }
  const params = new URL(request.url).searchParams;
  let filters;
  try { filters = analyticsFilters(params); } catch { return NextResponse.json({ error: "조회 필터를 확인하세요. 날짜는 KST 기준 최대 93일입니다." }, { status: 400, headers }); }
  try {
    const data = await loadAnalytics(filters);
    if (params.get("format") === "csv") {
      if (data.rows.length > 5000) return NextResponse.json({ error: "CSV는 최대 5000행입니다. 필터를 좁혀 주세요." }, { status: 422, headers });
      auditAdmin("csv-export", "allowed");
      return new Response(analyticsCsv(data.rows), { headers: { ...headers, "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="walk-analytics.csv"' } });
    }
    auditAdmin("read", "allowed");
    return NextResponse.json({ filters, total: data.rows.length, pageSize: 50, rows: data.rows.slice((filters.page - 1) * 50, filters.page * 50), summary: data.summary, diagnostics: data.diagnostics }, { headers });
  } catch (error) {
    auditAdmin("read", "error");
    const reason = error instanceof Error ? error.message : "DATABASE_READ_FAILED";
    const safe = ["STORAGE_UNCONFIGURED", "STORAGE_IDENTITY_UNVERIFIED", "DATABASE_READ_FAILED_OR_SCHEMA_MISSING", "INVALID_DATABASE_RESPONSE", "QUERY_TOO_LARGE_NARROW_FILTERS"].includes(reason) ? reason : "DATABASE_READ_FAILED";
    return NextResponse.json({ error: safe, dataState: "unavailable" }, { status: safe === "QUERY_TOO_LARGE_NARROW_FILTERS" ? 422 : 503, headers });
  }
}
