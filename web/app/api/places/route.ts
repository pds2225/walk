/** 목적지 검색 프록시. 키는 서버에만 두고, 브라우저에는 후보 목록만 내려간다. */
import { NextResponse } from "next/server";
import { searchDestinations } from "../../../lib/search";
import { TmapError } from "../../../lib/tmap";
import type { Coordinate } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 사용자가 한 번에 보낼 수 있는 검색어 길이 상한 — 그 이상은 오타이거나 남용이다. */
const MAX_QUERY_LEN = 100;

function parseCenter(params: URLSearchParams): Coordinate | null {
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  return { latitude: lat, longitude: lon };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, MAX_QUERY_LEN);
  if (!query) return NextResponse.json({ hits: [], hint: null });

  try {
    const { hits, hint } = await searchDestinations(query, parseCenter(params));
    return NextResponse.json({ hits, hint });
  } catch (err) {
    const message = err instanceof TmapError ? err.message : "장소를 찾지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
