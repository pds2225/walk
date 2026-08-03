/** 도보 경로 탐색 프록시. 출발·도착 좌표를 받아 엔진이 쓰는 RouteModel 을 돌려준다. */
import { NextResponse } from "next/server";
import { TmapError, fetchWalkingRoute } from "../../../lib/tmap";
import type { Coordinate } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function coord(value: unknown): Coordinate | null {
  if (typeof value !== "object" || value === null) return null;
  const lat = Number((value as Record<string, unknown>)["latitude"]);
  const lon = Number((value as Record<string, unknown>)["longitude"]);
  // 좌표계를 벗어난 값은 TMAP 에 보내기 전에 막는다 — 엉뚱한 경로보다 명확한 오류가 낫다.
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  return { latitude: lat, longitude: lon };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const origin = coord((body as Record<string, unknown>)?.["origin"]);
  const dest = coord((body as Record<string, unknown>)?.["dest"]);
  if (!origin || !dest) {
    return NextResponse.json({ error: "출발지·도착지 좌표가 필요합니다." }, { status: 400 });
  }

  try {
    return NextResponse.json(await fetchWalkingRoute(origin, dest));
  } catch (err) {
    const message = err instanceof TmapError ? err.message : "경로를 찾지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
