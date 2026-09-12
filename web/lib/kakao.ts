/**
 * 카카오 로컬(장소) 검색 — 네이버 지역검색과 같은 자리(상호·가게)를 메운다.
 *
 * 상호 검색 소스를 둘로 두는 이유: 한쪽이 못 찾는 가게를 다른 쪽이 찾는 일이 잦고,
 * 한쪽 키가 막혀도 검색이 통째로 죽지 않는다. 파이썬 `route_builder._kakao_local_hits`
 * 와 같은 규칙이다.
 *
 * 반드시 **REST API 키**를 쓴다 — JavaScript 키(브라우저 SDK)·네이티브 앱 키는 401 이 난다.
 * 서버에서만 호출하므로 키가 브라우저로 나가지 않는다.
 */
import { distanceMeters } from "@walk/route-engine";
import type { Coordinate } from "@walk/route-engine";
import type { PlaceHit } from "./types";

const LOCAL_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
const TIMEOUT_MS = 8_000;
/** 한 번에 받을 수 있는 최대 개수(문서 상한). */
const MAX_SIZE = 15;

function headers(): Record<string, string> | null {
  const key = process.env.KAKAO_REST_API_KEY;
  return key ? { Authorization: `KakaoAK ${key}` } : null;
}

/** 이 소스를 쓸 수 있는지(키가 있는지). 키 값은 노출하지 않는다. */
export function kakaoLocalAvailable(): boolean {
  return headers() !== null;
}

interface KakaoDocument {
  place_name?: unknown;
  address_name?: unknown;
  road_address_name?: unknown;
  /** 경도(문자열) */
  x?: unknown;
  /** 위도(문자열) */
  y?: unknown;
}

/**
 * documents[] → 후보 목록.
 *
 * x=경도, y=위도이며 문자열로 온다 — 네이버(mapx/mapy ×10^7 정수)와 규약이 다르다.
 * 헷갈리면 엉뚱한 곳으로 안내하게 되므로 변환은 여기 한 곳에서만 한다.
 * 표시는 네이버와 같은 '주소 뒤 상호'로 맞춰, 두 소스가 섞여도 한 형식으로 보이게 한다.
 */
export function parseKakaoDocuments(
  documents: readonly KakaoDocument[],
  query: string,
  center: Coordinate | null,
): PlaceHit[] {
  const out: PlaceHit[] = [];
  for (const doc of documents) {
    const lon = Number(doc.x);
    const lat = Number(doc.y);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < 33.0 || lat > 39.5 || lon < 124.0 || lon > 132.0) continue;

    const name = String(doc.place_name ?? "").trim();
    const addr = String(doc.road_address_name ?? doc.address_name ?? "").trim();
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
export async function searchKakaoLocal(
  query: string,
  center: Coordinate | null,
  limit = 8,
): Promise<PlaceHit[]> {
  const auth = headers();
  if (!auth) return [];

  const params = new URLSearchParams({
    query,
    size: String(Math.max(1, Math.min(limit, MAX_SIZE))),
  });
  if (center) {
    // x/y 만 넘기고 정렬은 기본값(accuracy)을 쓴다. sort=distance 로 두면 관련도를
    // 통째로 무시해 '경복궁' 검색에 근처 미용실·부동산이 뜬다(실측: 경복궁→쏘아베
    // 에스테틱, 강남역→바른명상연구소). accuracy 도 x/y 를 위치 편향으로 반영해
    // 'CU편의점' 같은 체인 검색은 거리순과 결과가 같았다 — 잃는 것 없이 관련도만 얻는다.
    params.set("x", center.longitude.toFixed(7));
    params.set("y", center.latitude.toFixed(7));
  }

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
    const documents = (body as { documents?: unknown }).documents;
    if (!Array.isArray(documents)) return [];
    return parseKakaoDocuments(documents as KakaoDocument[], query, center);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
