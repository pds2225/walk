/**
 * 목적지 검색 합치기 검증.
 *
 * 핵심 계약 두 가지:
 *   - 네이버 지역검색(상호)이 TMAP 앞에 온다. "네이버엔 나오는데 여긴 안 뜬다"의 수정.
 *   - 소스가 꺼졌거나 전부 실패한 것을 '결과 없음'으로 감추지 않는다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { moveCoordinateByMeters } from "@walk/route-engine";
import type { Coordinate } from "@walk/route-engine";
import type { PlaceHit } from "./types";

const ORIGIN: Coordinate = { latitude: 37.5665, longitude: 126.978 };
const at = (east: number, north: number) => moveCoordinateByMeters(ORIGIN, east, north);

vi.mock("./naver", () => ({
  naverLocalAvailable: vi.fn(() => true),
  searchLocal: vi.fn(async (): Promise<PlaceHit[]> => []),
}));
vi.mock("./tmap", async () => {
  const actual = await vi.importActual<typeof import("./tmap")>("./tmap");
  return {
    ...actual,
    tmapAvailable: vi.fn(() => true),
    searchTmapPlaces: vi.fn(async (): Promise<PlaceHit[]> => []),
  };
});

const naver = await import("./naver");
const tmap = await import("./tmap");
const { missingSourceHint, searchDestinations, sourceStatus } = await import("./search");

const mockNaverAvailable = vi.mocked(naver.naverLocalAvailable);
const mockSearchLocal = vi.mocked(naver.searchLocal);
const mockTmapAvailable = vi.mocked(tmap.tmapAvailable);
const mockSearchTmap = vi.mocked(tmap.searchTmapPlaces);

function reset() {
  mockNaverAvailable.mockReturnValue(true);
  mockTmapAvailable.mockReturnValue(true);
  mockSearchLocal.mockResolvedValue([]);
  mockSearchTmap.mockResolvedValue([]);
}

afterEach(() => {
  vi.clearAllMocks();
  reset();
});
reset();

describe("searchDestinations", () => {
  it("네이버 지역검색 결과를 TMAP 보다 앞에 둔다", async () => {
    mockSearchLocal.mockResolvedValue([{ name: "동네치킨", coordinate: at(10, 0) }]);
    mockSearchTmap.mockResolvedValue([{ name: "서울시청", coordinate: at(500, 0) }]);

    const { hits } = await searchDestinations("치킨", null);

    expect(hits.map((h) => h.name)).toEqual(["동네치킨", "서울시청"]);
  });

  it("이름이 같고 가까운 후보는 한 번만 보여준다", async () => {
    // 같은 가게를 두 소스가 조금 다른 좌표로 준 경우
    mockSearchLocal.mockResolvedValue([{ name: "동네치킨", coordinate: at(0, 0) }]);
    mockSearchTmap.mockResolvedValue([{ name: "동네치킨", coordinate: at(20, 0) }]);

    const { hits } = await searchDestinations("치킨", null);

    expect(hits).toHaveLength(1);
  });

  it("이름이 같아도 멀리 떨어진 지점은 둘 다 남긴다", async () => {
    // 다른 동네의 같은 이름 지점 — 지우면 사용자가 원하는 지점이 사라진다
    mockSearchLocal.mockResolvedValue([
      { name: "동네치킨", coordinate: at(0, 0) },
      { name: "동네치킨", coordinate: at(800, 0) },
    ]);

    const { hits } = await searchDestinations("치킨", null);

    expect(hits).toHaveLength(2);
  });

  it("현재 위치를 주면 가까운 순으로 정렬한다", async () => {
    mockSearchLocal.mockResolvedValue([
      { name: "먼곳", coordinate: at(900, 0), distanceMeters: 900 },
      { name: "가까운곳", coordinate: at(50, 0), distanceMeters: 50 },
    ]);

    const { hits } = await searchDestinations("치킨", ORIGIN);

    expect(hits.map((h) => h.name)).toEqual(["가까운곳", "먼곳"]);
  });

  it("한 소스가 실패해도 나머지 후보는 살린다", async () => {
    mockSearchLocal.mockRejectedValue(new Error("naver down"));
    mockSearchTmap.mockResolvedValue([{ name: "서울시청", coordinate: at(0, 0) }]);

    const { hits } = await searchDestinations("시청", null);

    expect(hits.map((h) => h.name)).toEqual(["서울시청"]);
  });

  it("켜진 소스가 전부 실패하면 빈 목록으로 감추지 않고 오류를 낸다", async () => {
    mockSearchLocal.mockRejectedValue(new Error("naver down"));
    mockSearchTmap.mockRejectedValue(new Error("tmap down"));

    await expect(searchDestinations("시청", null)).rejects.toThrow();
  });

  it("키가 하나도 없으면 오류를 낸다 — '장소 없음'으로 보이면 안 된다", async () => {
    mockNaverAvailable.mockReturnValue(false);
    mockTmapAvailable.mockReturnValue(false);

    await expect(searchDestinations("시청", null)).rejects.toThrow();
  });

  it("결과가 0건이면 빠진 소스를 이유로 함께 돌려준다", async () => {
    mockNaverAvailable.mockReturnValue(false);   // 상호 검색 불가

    const { hits, hint } = await searchDestinations("동네치킨", null);

    expect(hits).toEqual([]);
    expect(hint).toContain("네이버 지역검색");
  });

  it("결과가 있으면 이유를 붙이지 않는다", async () => {
    mockNaverAvailable.mockReturnValue(false);
    mockSearchTmap.mockResolvedValue([{ name: "서울시청", coordinate: at(0, 0) }]);

    const { hint } = await searchDestinations("시청", null);

    expect(hint).toBeNull();
  });

  it("limit 을 넘겨 받지 않는다", async () => {
    mockSearchLocal.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ name: `가게${i}`, coordinate: at(i * 100, 0) })),
    );

    const { hits } = await searchDestinations("가게", null, 5);

    expect(hits).toHaveLength(5);
  });
});

describe("sourceStatus / missingSourceHint", () => {
  it("키 설정 여부만 bool 로 알린다", async () => {
    expect(sourceStatus()).toEqual({ naverLocal: true, tmap: true });
    expect(Object.values(sourceStatus()).every((v) => typeof v === "boolean")).toBe(true);
  });

  it("상호 검색이 막히는 네이버 지역검색을 먼저 짚는다", async () => {
    mockNaverAvailable.mockReturnValue(false);
    mockTmapAvailable.mockReturnValue(false);

    expect(missingSourceHint()).toContain("네이버 지역검색");
  });

  it("TMAP 만 없으면 TMAP 을 짚는다", async () => {
    mockTmapAvailable.mockReturnValue(false);

    expect(missingSourceHint()).toContain("TMAP");
  });

  it("다 있으면 덧붙일 말이 없다", async () => {
    expect(missingSourceHint()).toBeNull();
  });
});
