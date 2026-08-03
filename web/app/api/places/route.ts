/** 목적지 검색 프록시. 앱키는 서버에만 두고, 브라우저에는 후보 목록만 내려간다. */
import { NextResponse } from "next/server";
import { TmapError, searchPlaces } from "../../../lib/tmap";
import type { Coordinate } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCenter(params: URLSearchParams): Coordinate | null {
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { latitude: lat, longitude: lon };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  if (!query) return NextResponse.json({ hits: [] });

  try {
    const hits = await searchPlaces(query, parseCenter(params));
    return NextResponse.json({ hits });
  } catch (err) {
    const message = err instanceof TmapError ? err.message : "장소를 찾지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
