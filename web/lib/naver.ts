/**
 * 네이버 지역검색 — '네이버 지도에 뜨는 상호·가게'를 좌표로 바꾸는 유일한 소스.
 *
 * TMAP POI 는 역·큰 건물·관광지 위주라 동네 가게가 많이 빠진다. 실기기 보고
 * "네이버에 검색되는데 내 앱에서는 안 나온다"의 원인이 이것이라, 파이썬
 * `route_builder._naver_local_hits` 와 같은 규칙으로 여기에도 붙인다.
 *
 * 키는 서버에만 둔다. 지오코딩(NCP maps)과는 **다른** developers.naver.com
 * '검색' 애플리케이션 키다 — 지도 키만 넣고 검색 키를 빠뜨리는 일이 흔하다.
 */
import { distanceMeters } from "@walk/route-engine";
import type { Coordinate } from "@walk/route-engine";
import type { PlaceHit } from "./types";

const LOCAL_URL = "https://openapi.naver.com/v1/search/local.json";
const TIMEOUT_MS = 8_000;
/** 지역검색 API 가 한 번에 주는 최대 개수(문서 상한). */
const MAX_DISPLAY = 5;

/** title 의 <b> 하이라이트 태그 제거용. */
const HTML_TAG_RE = /<[^>]+>/g;

export class NaverError extends Error {}

function headers(): Record<string, string> | null {
  const id = process.env.NAVER_SEARCH_CLIENT_ID;
  const secret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret };
}

/** 이 소스를 쓸 수 있는지(키가 있는지). 키 값은 노출하지 않는다. */
export function naverLocalAvailable(): boolean {
  return headers() !== null;
}

interface LocalItem {
  title?: unknown;
  address?: unknown;
  roadAddress?: unknown;
  mapx?: unknown;
  mapy?: unknown;
}

/**
 * 지역검색 items[] → 후보 목록.
 *
 * mapx/mapy 는 WGS84 좌표 ×10^7 정수다(경도=mapx/1e7, 위도=mapy/1e7). 한국 범위를
 * 벗어나면 좌표계를 잘못 읽은 것이므로 버린다 — 엉뚱한 목적지로 안내하느니 후보에서 빼는 게 낫다.
 */
export function parseLocalItems(
  items: readonly LocalItem[],
  query: string,
  center: Coordinate | null,
): PlaceHit[] {
  const out: PlaceHit[] = [];
  for (const item of items) {
    const lon = Number(item.mapx) / 1e7;
    const lat = Number(item.mapy) / 1e7;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < 33.0 || lat > 39.5 || lon < 124.0 || lon > 132.0) continue;

    const name = String(item.title ?? "").replace(HTML_TAG_RE, "").trim();
    const addr = String(item.roadAddress ?? item.address ?? "").trim();
    // 한국식 표기: '주소 뒤 상호'(예: '서울 종로구 사직로 161 경복궁')
    const display = name && addr ? `${addr} ${name}` : name || addr || query;

    const coordinate: Coordinate = { latitude: lat, longitude: lon };
    out.push(
      center
        ? { name: display, coordinate, distanceMeters: Math.round(distanceMeters(center, coordinate)) }
        : { name: display, coordinate },
    );
  }
  return out;
}

/** 키 없음·오류·결과 없음이면 [] — 다른 소스로 통과시킨다(예외를 올리지 않는다). */
export async function searchLocal(
  query: string,
  center: Coordinate | null,
  limit = MAX_DISPLAY,
): Promise<PlaceHit[]> {
  const auth = headers();
  if (!auth) return [];

  const params = new URLSearchParams({
    query,
    display: String(Math.max(1, Math.min(limit, MAX_DISPLAY))),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${LOCAL_URL}?${params}`, {
      headers: auth,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!resp.ok) return [];
    const body: unknown = await resp.json();
    const items = (body as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];
    return parseLocalItems(items as LocalItem[], query, center);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
