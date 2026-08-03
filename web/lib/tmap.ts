/**
 * TMAP 서버 클라이언트 — 앱키는 절대 브라우저로 내보내지 않는다.
 *
 * 파이썬 `streamlit_walk_engine/route_builder.py` 와 같은 엔드포인트·같은 회전 판정
 * 규칙을 쓴다. 두 구현이 갈리면 같은 길에서 안내가 달라지므로, 상수(회전 타입 코드,
 * 30° 임계, ±15m 측정 구간)는 그쪽 주석과 함께 읽어야 한다.
 */
import { angularDifference, bearingDegrees, distanceMeters } from "@walk/route-engine";
import type { Coordinate, RouteModel, TurnDirection, TurnPoint } from "@walk/route-engine";
import type { PlaceHit, RouteResponse } from "./types";

const PEDESTRIAN_URL = "https://apis.openapi.sk.com/tmap/routes/pedestrian";
const POI_URL = "https://apis.openapi.sk.com/tmap/pois";
const ADDR_GEO_URL = "https://apis.openapi.sk.com/tmap/geo/fullAddrGeo";

const TIMEOUT_MS = 8_000;

/** 좌회전 / 8시 방향 / 10시 방향 (route_builder._TMAP_TURN_LEFT 와 동일) */
const TURN_LEFT = new Set([12, 16, 17]);
/** 우회전 / 2시 방향 / 4시 방향 (route_builder._TMAP_TURN_RIGHT 와 동일) */
const TURN_RIGHT = new Set([13, 18, 19]);

/** 이 각도 미만으로 꺾이면 '완만한 커브'라 회전으로 안내하지 않는다. */
const MIN_TURN_HEADING_CHANGE_DEGREES = 30;
/** 방위를 잴 때 앞뒤로 확보할 거리(m). 촘촘한 polyline 에서 1~2m 선분의 방위가 튀는 것을 막는다. */
const TURN_HEADING_SPAN_METERS = 15;

export class TmapError extends Error {}

function appKey(): string {
  const key = process.env.TMAP_APP_KEY;
  if (!key) {
    throw new TmapError("TMAP_APP_KEY 가 설정되지 않았습니다. Vercel 환경변수를 확인하세요.");
  }
  return key;
}

async function tmapFetch(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { appKey: appKey(), Accept: "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
    });
    if (!resp.ok) {
      throw new TmapError(`TMAP 응답 오류 (${resp.status})`);
    }
    return await resp.json();
  } catch (err) {
    if (err instanceof TmapError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new TmapError("TMAP 응답이 너무 느립니다. 잠시 후 다시 시도하세요.");
    }
    throw new TmapError("TMAP 호출에 실패했습니다.");
  } finally {
    clearTimeout(timer);
  }
}

// ── 회전 판정 ────────────────────────────────────────────────────────────────

/** polyline[index] 에서 실제로 몇 도 꺾이는지. 앞뒤 구간이 없으면 null. */
function headingChangeDegrees(polyline: readonly Coordinate[], index: number): number | null {
  const last = polyline.length - 1;
  if (index <= 0 || index >= last) return null;

  let before = 0;
  let span = 0;
  for (let i = index; i > 0; i -= 1) {
    span += distanceMeters(polyline[i - 1]!, polyline[i]!);
    before = i - 1;
    if (span >= TURN_HEADING_SPAN_METERS) break;
  }

  let after = last;
  span = 0;
  for (let i = index; i < last; i += 1) {
    span += distanceMeters(polyline[i]!, polyline[i + 1]!);
    after = i + 1;
    if (span >= TURN_HEADING_SPAN_METERS) break;
  }

  const a = polyline[before]!;
  const b = polyline[index]!;
  const c = polyline[after]!;
  if (sameCoord(a, b) || sameCoord(b, c)) return null;

  return angularDifference(bearingDegrees(a, b), bearingDegrees(b, c));
}

function sameCoord(a: Coordinate, b: Coordinate): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

/** 안내할 가치가 있는 회전인지 — 완만한 커브는 회전으로 보지 않는다. */
/** 이 소스를 쓸 수 있는지(앱키가 있는지). 키 값은 노출하지 않는다. */
export function tmapAvailable(): boolean {
  return Boolean(process.env.TMAP_APP_KEY);
}

export function isSignificantTurn(polyline: readonly Coordinate[], index: number): boolean {
  const change = headingChangeDegrees(polyline, index);
  return change !== null && change >= MIN_TURN_HEADING_CHANGE_DEGREES;
}

// ── 보행자 경로 ──────────────────────────────────────────────────────────────

interface TmapFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
}

/** TMAP 보행자 경로 응답(GeoJSON features)을 RouteModel 로 변환한다. */
export function routeFromFeatures(features: readonly TmapFeature[]): RouteResponse {
  const coords: Coordinate[] = [];
  const rawTurns: Array<{ index: number; direction: TurnDirection; description: string }> = [];
  let totalDistanceMeters: number | null = null;
  let totalSeconds: number | null = null;

  for (const feature of features) {
    const props = feature.properties ?? {};
    if (totalDistanceMeters === null && typeof props["totalDistance"] === "number") {
      totalDistanceMeters = Math.round(props["totalDistance"]);
    }
    if (totalSeconds === null && typeof props["totalTime"] === "number") {
      totalSeconds = Math.round(props["totalTime"]);
    }

    const gtype = feature.geometry?.type;
    if (gtype === "Point") {
      const turnType = props["turnType"];
      if (typeof turnType === "number" && (TURN_LEFT.has(turnType) || TURN_RIGHT.has(turnType))) {
        rawTurns.push({
          // Point 좌표는 직전 LineString 의 마지막 좌표 — 그 시점의 polyline 끝 인덱스를 쓴다.
          index: coords.length - 1,
          direction: TURN_LEFT.has(turnType) ? "left" : "right",
          description: String(props["description"] ?? "").trim(),
        });
      }
    } else if (gtype === "LineString") {
      const raw = feature.geometry?.coordinates;
      if (!Array.isArray(raw)) continue;
      for (const pair of raw) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const c: Coordinate = { latitude: Number(pair[1]), longitude: Number(pair[0]) };
        if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) continue;
        const prev = coords[coords.length - 1];
        if (prev && sameCoord(prev, c)) continue;   // 구간 경계의 중복 좌표 제거
        coords.push(c);
      }
    }
  }

  if (coords.length < 2) {
    throw new TmapError("경로 좌표가 너무 적습니다.");
  }

  const turnPoints: TurnPoint[] = [];
  const turnDescriptions: Record<string, string> = {};
  const seen = new Set<number>();
  let tid = 0;
  for (const turn of rawTurns) {
    if (seen.has(turn.index) || turn.index <= 0 || turn.index >= coords.length - 1) continue;
    if (!isSignificantTurn(coords, turn.index)) continue;
    seen.add(turn.index);
    tid += 1;
    const id = `turn-${tid}`;
    turnPoints.push({
      id,
      coordinate: coords[turn.index]!,
      routeIndex: turn.index,
      direction: turn.direction,
    });
    if (turn.description) turnDescriptions[id] = turn.description;
  }

  const route: RouteModel = { polyline: coords, turnPoints };
  return { route, totalDistanceMeters, totalSeconds, turnDescriptions, source: "tmap" };
}

export async function fetchWalkingRoute(origin: Coordinate, dest: Coordinate): Promise<RouteResponse> {
  const body = await tmapFetch(`${PEDESTRIAN_URL}?version=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startX: origin.longitude.toFixed(8),
      startY: origin.latitude.toFixed(8),
      endX: dest.longitude.toFixed(8),
      endY: dest.latitude.toFixed(8),
      // TMAP 은 이 두 값을 URL 인코딩된 UTF-8 로 받는다(필수).
      startName: encodeURIComponent("출발"),
      endName: encodeURIComponent("도착"),
      reqCoordType: "WGS84GEO",
      resCoordType: "WGS84GEO",
      searchOption: "0",   // 0 = 추천 경로
    }),
  });

  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features)) throw new TmapError("경로 응답 형식이 예상과 다릅니다.");
  return routeFromFeatures(features as TmapFeature[]);
}

// ── 장소 검색 ────────────────────────────────────────────────────────────────

function poiHits(body: unknown, center: Coordinate | null): PlaceHit[] {
  const pois = (body as { searchPoiInfo?: { pois?: { poi?: unknown } } })?.searchPoiInfo?.pois?.poi;
  if (!Array.isArray(pois)) return [];

  const hits: PlaceHit[] = [];
  for (const raw of pois) {
    const poi = raw as Record<string, unknown>;
    const lat = Number(poi["frontLat"] ?? poi["noorLat"]);
    const lon = Number(poi["frontLon"] ?? poi["noorLon"]);
    const name = String(poi["name"] ?? "").trim();
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const coordinate: Coordinate = { latitude: lat, longitude: lon };
    hits.push(
      center
        ? { name, coordinate, distanceMeters: Math.round(distanceMeters(center, coordinate)) }
        : { name, coordinate },
    );
  }
  return hits;
}

function addressHits(body: unknown): PlaceHit[] {
  const info = (body as { coordinateInfo?: { coordinate?: unknown } })?.coordinateInfo?.coordinate;
  if (!Array.isArray(info)) return [];

  const hits: PlaceHit[] = [];
  for (const raw of info) {
    const item = raw as Record<string, unknown>;
    const lat = Number(item["lat"] || item["newLat"]);
    const lon = Number(item["lon"] || item["newLon"]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const name = [item["city_do"], item["gu_gun"], item["legalDong"], item["bunji"]]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (!name) continue;
    hits.push({ name, coordinate: { latitude: lat, longitude: lon } });
  }
  return hits;
}

/**
 * TMAP 후보 — 주소(fullAddrGeo)와 장소명(POI)을 동시에 물어 합친다.
 *
 * 파이썬쪽과 같은 이유로 둘 다 쓴다: '역삼동 123' 같은 주소지와 '강남역 10번출구' 같은
 * 장소는 서로 다른 API 가 답한다. center 를 주면 POI 를 거리순으로 받아 동명 장소
 * 오선택을 줄인다(searchtypCd=R).
 */
export async function searchTmapPlaces(query: string, center: Coordinate | null, limit = 8): Promise<PlaceHit[]> {
  const poiParams = new URLSearchParams({
    version: "1",
    searchKeyword: query,
    count: String(limit),
    resCoordType: "WGS84GEO",
    searchtypCd: center ? "R" : "A",   // R=거리순, A=정확도순
  });
  if (center) {
    poiParams.set("centerLat", center.latitude.toFixed(7));
    poiParams.set("centerLon", center.longitude.toFixed(7));
    poiParams.set("radius", "0");      // 0 = 반경 제한 없음(멀리 있는 목적지도 후보에 든다)
  }

  const addrParams = new URLSearchParams({
    version: "1",
    fullAddr: query,
    coordType: "WGS84GEO",
  });

  // 앱키 누락 같은 설정 오류는 여기서 먼저 터뜨린다 — 아래 allSettled 에 삼켜지면
  // '검색 결과 없음'으로 보여, 있는 장소를 없다고 알리는 최악의 오해가 생긴다.
  appKey();

  // 한쪽이 실패해도 나머지 후보는 살린다 — 검색이 통째로 비는 것이 가장 나쁘다.
  const [poi, addr] = await Promise.allSettled([
    tmapFetch(`${POI_URL}?${poiParams}`, { method: "GET" }),
    tmapFetch(`${ADDR_GEO_URL}?${addrParams}`, { method: "GET" }),
  ]);

  // 둘 다 실패했으면 네트워크·API 문제다. 빈 목록으로 감추지 않고 그대로 알린다.
  if (poi.status === "rejected" && addr.status === "rejected") {
    throw poi.reason instanceof TmapError ? poi.reason : new TmapError("장소 검색에 실패했습니다.");
  }

  const merged: PlaceHit[] = [
    ...(addr.status === "fulfilled" ? addressHits(addr.value) : []),
    ...(poi.status === "fulfilled" ? poiHits(poi.value, center) : []),
  ];

  const seen = new Set<string>();
  const unique = merged.filter((hit) => {
    const key = `${hit.name}@${hit.coordinate.latitude.toFixed(5)},${hit.coordinate.longitude.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (center) {
    unique.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
  }
  return unique.slice(0, limit);
}
