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
import { naverLocalAvailable, searchLocal } from "./naver";
import { TmapError, searchTmapPlaces, tmapAvailable } from "./tmap";
import type { PlaceHit } from "./types";

/**
 * 표시 이름이 같고 이만큼(m) 안에 있으면 같은 곳으로 본다.
 *
 * 소스마다 같은 가게의 좌표가 조금씩 다르게 온다. 좌표만으로 중복을 걸러내면 같은
 * 이름이 여러 줄로 뜨고, 이름만으로 걸러내면 '다른 동네의 같은 이름 지점'이 사라진다.
 * (파이썬 _DEDUP_NEAR_M 과 같은 값·같은 이유)
 */
const DEDUP_NEAR_M = 60;

export interface SourceStatus {
  /** 네이버 지역검색 — 상호·가게 이름이 나오는 유일한 소스 */
  readonly naverLocal: boolean;
  /** TMAP — 주소와 큰 장소 */
  readonly tmap: boolean;
}

/** 소스별 사용 가능 여부(키 설정 여부)만 반환한다. 키 값은 절대 반환하지 않는다. */
export function sourceStatus(): SourceStatus {
  return { naverLocal: naverLocalAvailable(), tmap: tmapAvailable() };
}

/** 검색이 비었을 때 덧붙일 설명. 빠진 소스가 없으면 null. */
export function missingSourceHint(): string | null {
  const status = sourceStatus();
  if (!status.naverLocal) {
    return "네이버 지역검색이 꺼져 있어 상호·가게 이름은 검색되지 않습니다. 주소나 지하철역 출구로 찾아보세요.";
  }
  if (!status.tmap) {
    return "TMAP 키가 없어 주소·장소 검색이 제한됩니다.";
  }
  return null;
}

function dedupe(hits: readonly PlaceHit[]): PlaceHit[] {
  const byName = new Map<string, Coordinate[]>();
  const out: PlaceHit[] = [];
  for (const hit of hits) {
    const near = byName.get(hit.name);
    if (near?.some((c) => distanceMeters(c, hit.coordinate) <= DEDUP_NEAR_M)) continue;
    if (near) near.push(hit.coordinate);
    else byName.set(hit.name, [hit.coordinate]);
    out.push(hit);
  }
  return out;
}

export interface SearchOutcome {
  readonly hits: PlaceHit[];
  /** 결과가 비었을 때 사용자에게 보여줄 이유. 결과가 있으면 null. */
  readonly hint: string | null;
}

export async function searchDestinations(
  query: string,
  center: Coordinate | null,
  limit = 8,
): Promise<SearchOutcome> {
  const status = sourceStatus();
  if (!status.naverLocal && !status.tmap) {
    throw new TmapError("검색에 필요한 키가 하나도 설정돼 있지 않습니다. 서버 환경변수를 확인하세요.");
  }

  const [local, tmap] = await Promise.allSettled([
    status.naverLocal ? searchLocal(query, center, limit) : Promise.resolve<PlaceHit[]>([]),
    status.tmap ? searchTmapPlaces(query, center, limit) : Promise.resolve<PlaceHit[]>([]),
  ]);

  // 켜져 있는 소스가 전부 실패했으면 네트워크·API 문제다. 그대로 알린다.
  const enabled = [
    status.naverLocal ? local : null,
    status.tmap ? tmap : null,
  ].filter((r): r is PromiseSettledResult<PlaceHit[]> => r !== null);
  if (enabled.length > 0 && enabled.every((r) => r.status === "rejected")) {
    const first = enabled[0];
    const reason = first?.status === "rejected" ? first.reason : undefined;
    throw reason instanceof TmapError ? reason : new TmapError("장소 검색에 실패했습니다.");
  }

  // 네이버 지역검색을 앞에 둔다 — 상호로 찾는 사람이 원하는 답은 대개 여기 있다.
  const merged = [
    ...(local.status === "fulfilled" ? local.value : []),
    ...(tmap.status === "fulfilled" ? tmap.value : []),
  ];

  const unique = dedupe(merged);
  // 현재 위치를 알면 가까운 순으로 — 동명 장소 오선택을 줄인다. 다만 거리를 모르는
  // 후보(주소 지오코딩 결과 등)를 뒤로 밀어내지 않도록 안정 정렬을 유지한다.
  if (center) {
    unique.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
  }

  const hits = unique.slice(0, limit);
  return { hits, hint: hits.length === 0 ? missingSourceHint() : null };
}
