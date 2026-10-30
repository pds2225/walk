/**
 * 목적지 후보 합치기 — 네이버 지역검색(상호) + TMAP(주소·장소).
 *
 * 파이썬 `route_builder.geocode_suggestions` 와 같은 우선순위를 쓴다:
 *   1) 네이버 지역검색 — 네이버 지도에 뜨는 상호·가게. 여기서만 나오는 게 많다.
 *   2) 주소(TMAP fullAddrGeo)
 *   3) 장소(TMAP POI)
 * 소스 하나가 죽어도 나머지는 살린다. 다만 '전부 죽음'은 빈 목록으로 감추지 않는다 —
 * 그러면 화면에서 '장소 없음'과 구별되지 않아, 있는 곳을 없다고 알리게 된다.
 */
import { distanceMeters } from "@walk/route-engine";
import type { Coordinate } from "@walk/route-engine";
import { kakaoLocalAvailable, searchKakaoLocal } from "./kakao";
import { naverLocalAvailable, searchLocal } from "./naver";
import { TmapError, searchTmapPlaces, tmapAvailable } from "./tmap";
import type { PlaceHit } from "./types";

/**
 * 소스별 좌표 오차를 고려한 근접 기준(m). 이름·거리 외에 서로 다른 주소인지도 확인한다.
 * 같은 이름이어도 서로 다른 주소를 가진 근접 지점은 각각 선택할 수 있어야 한다.
 * (파이썬 _DEDUP_NEAR_M 과 같은 거리 기준)
 */
const DEDUP_NEAR_M = 60;

export interface SourceStatus {
  /** 카카오 로컬 — 상호·가게 */
  readonly kakaoLocal: boolean;
  /** 네이버 지역검색 — 상호·가게 */
  readonly naverLocal: boolean;
  /** TMAP — 주소와 큰 장소 */
  readonly tmap: boolean;
}

/** 소스별 사용 가능 여부(키 설정 여부)만 반환한다. 키 값은 절대 반환하지 않는다. */
export function sourceStatus(): SourceStatus {
  return {
    kakaoLocal: kakaoLocalAvailable(),
    naverLocal: naverLocalAvailable(),
    tmap: tmapAvailable(),
  };
}

/** 검색이 비었을 때 덧붙일 설명. 빠진 소스가 없으면 null. */
export function missingSourceHint(): string | null {
  const status = sourceStatus();
  // 상호·가게는 카카오/네이버에서만 나온다. 하나만 켜져 있어도 되므로 둘 다 꺼졌을 때만 짚는다.
  if (!status.kakaoLocal && !status.naverLocal) {
    return "상호·가게 이름 검색이 꺼져 있습니다. 주소나 지하철역 출구로 찾아보세요.";
  }
  if (!status.tmap) {
    return "TMAP 키가 없어 주소·장소 검색이 제한됩니다.";
  }
  return null;
}

/** 주소 공백·대소문자만 정규화한다. 서로 다른 원본 주소를 같은 장소라고 추정하지 않는다. */
function normalizeAddress(address: string | undefined): string {
  return (address ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}


/**
 * 이름만으로 지하철·전철역(및 출구) 후보인지 본다.
 * PlaceHit 에 카테고리가 없어 휴리스틱을 쓴다. '신촌점' 같은 분점은 제외.
 * TMAP 표기 `합정역[수도권2호선]`, `홍대입구역 9번출구` 도 포함한다.
 */
export function isLikelySubwayStation(name: string): boolean {
  const compact = name.replace(/\s+/g, "");
  if (!compact) return false;
  // 분점·상호는 제외
  if (/(점|마트|병원|약국|카페|식당|치킨|호텔|맥주)$/.test(compact)) return false;
  if (/역점/.test(compact)) return false;
  // 신촌역2번출구 / 강남역10번출구 / 홍대입구역9번출구
  if (/[가-힣A-Za-z0-9]+역\d+번출구/.test(compact)) return true;
  // 홍대입구역출구
  if (/[가-힣A-Za-z0-9]+역출구/.test(compact)) return true;
  // 합정역[수도권2호선] / 서울역(1호선)
  if (/[가-힣A-Za-z0-9]+역[[(]/.test(compact)) return true;
  // 신촌역 · 서울역 · 홍대입구역
  if (/^[가-힣A-Za-z0-9]+역$/.test(compact)) return true;
  return false;
}

/** 주소 지오코딩만 있는 후보(name===address). 역 검색을 가로채지 않게 뒤로 민다. */
export function isAddressOnlyHit(hit: { name: string; address?: string | undefined }): boolean {
  const name = hit.name.replace(/\s+/g, " ").trim();
  const address = (hit.address ?? "").replace(/\s+/g, " ").trim();
  if (!name) return false;
  if (isLikelySubwayStation(name)) return false;
  return !address || name === address;
}

function dedupe(hits: readonly PlaceHit[]): PlaceHit[] {
  const byName = new Map<string, number[]>();
  const out: PlaceHit[] = [];
  for (const hit of hits) {
    const normalizedName = hit.name.replace(/\s+/g, " ").trim().toLocaleLowerCase();
    const hitAddress = normalizeAddress(hit.address);
    const nearby = (byName.get(normalizedName) ?? []).find((index) => {
      const existing = out[index]!;
      if (distanceMeters(existing.coordinate, hit.coordinate) > DEDUP_NEAR_M) return false;
      const existingAddress = normalizeAddress(existing.address);
      // 양쪽 주소가 명확히 다르면 가까운 동명 장소라도 별도 목적지다.
      return !existingAddress || !hitAddress || existingAddress === hitAddress;
    });
    if (nearby !== undefined) {
      // 동일 지점의 주소가 한 제공자에서만 누락된 경우 더 자세한 쪽을 보존한다.
      if (!normalizeAddress(out[nearby]!.address) && hitAddress) out[nearby] = hit;
      continue;
    }
    const indices = byName.get(normalizedName);
    if (indices) indices.push(out.length);
    else byName.set(normalizedName, [out.length]);
    out.push(hit);
  }
  // 주소 지오코딩 결과(name===address)가 같은 지점의 상호 결과와 겹치면 상호 쪽만 남긴다 —
  // 같은 곳이 어떤 때는 이름+주소, 어떤 때는 주소만으로 보이던 원인.
  const named = out.filter((h) => h.address !== h.name);
  return out.filter(
    (h) => h.address !== h.name || !named.some((n) => distanceMeters(n.coordinate, h.coordinate) <= DEDUP_NEAR_M),
  );
}

export interface SearchOutcome {
  readonly hits: PlaceHit[];
  /** 결과가 비었을 때 사용자에게 보여줄 이유. 결과가 있으면 null. */
  readonly hint: string | null;
}

export async function searchDestinations(
  query: string,
  center: Coordinate | null,
  limit = 15,
): Promise<SearchOutcome> {
  const status = sourceStatus();
  if (!status.kakaoLocal && !status.naverLocal && !status.tmap) {
    throw new TmapError("검색에 필요한 키가 하나도 설정돼 있지 않습니다. 서버 환경변수를 확인하세요.");
  }

  const none = Promise.resolve<PlaceHit[]>([]);
  const [kakao, naver, tmap] = await Promise.allSettled([
    status.kakaoLocal ? searchKakaoLocal(query, center, limit) : none,
    status.naverLocal ? searchLocal(query, center, limit) : none,
    status.tmap ? searchTmapPlaces(query, center, limit) : none,
  ]);

  // 켜져 있는 소스가 전부 실패했으면 네트워크·API 문제다. 그대로 알린다.
  const enabled = [
    status.kakaoLocal ? kakao : null,
    status.naverLocal ? naver : null,
    status.tmap ? tmap : null,
  ].filter((r): r is PromiseSettledResult<PlaceHit[]> => r !== null);
  if (enabled.length > 0 && enabled.every((r) => r.status === "rejected")) {
    const first = enabled[0];
    const reason = first?.status === "rejected" ? first.reason : undefined;
    throw reason instanceof TmapError ? reason : new TmapError("장소 검색에 실패했습니다.");
  }

  const value = (r: PromiseSettledResult<PlaceHit[]>) => (r.status === "fulfilled" ? r.value : []);
  // 상호 소스(카카오·네이버)를 번갈아 섞어 앞에 둔다. 한쪽을 앞에 몰아 넣으면 limit 에
  // 막혀 다른 쪽 결과가 아예 안 보인다. 한 소스가 비면 다른 소스가 그 자리를 채운다.
  const kakaoHits = value(kakao);
  const naverHits = value(naver);
  const interleaved: PlaceHit[] = [];
  for (let i = 0; i < Math.max(kakaoHits.length, naverHits.length); i += 1) {
    const k = kakaoHits[i];
    const n = naverHits[i];
    if (k) interleaved.push(k);
    if (n) interleaved.push(n);
  }
  const merged = [...interleaved, ...value(tmap)];

  const unique = dedupe(merged);
  // 1) 지하철역·N번출구  2) 그 외 상호/POI  3) 주소 지오코딩만
  // 실사용: '서울역'에 광진구 구의동 주소가 맨 위 → 엉뚱한 안내.
  unique.sort((a, b) => {
    const rank = (hit: PlaceHit) => {
      if (isLikelySubwayStation(hit.name)) return 0;
      if (isAddressOnlyHit(hit)) return 2;
      return 1;
    };
    const rankDelta = rank(a) - rank(b);
    if (rankDelta !== 0) return rankDelta;
    if (!center) return 0;
    return (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity);
  });

  const hits = unique.slice(0, limit);
  return { hits, hint: hits.length === 0 ? missingSourceHint() : null };
}
