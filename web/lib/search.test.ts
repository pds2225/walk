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

vi.mock("./kakao", () => ({
  kakaoLocalAvailable: vi.fn(() => true),
  searchKakaoLocal: vi.fn(async (): Promise<PlaceHit[]> => []),
}));
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

const kakao = await import("./kakao");
const naver = await import("./naver");
const tmap = await import("./tmap");
const { isLikelySubwayStation, missingSourceHint, searchDestinations, sourceStatus } = await import("./search");

const mockKakaoAvailable = vi.mocked(kakao.kakaoLocalAvailable);
const mockSearchKakao = vi.mocked(kakao.searchKakaoLocal);
const mockNaverAvailable = vi.mocked(naver.naverLocalAvailable);
const mockSearchLocal = vi.mocked(naver.searchLocal);
const mockTmapAvailable = vi.mocked(tmap.tmapAvailable);
const mockSearchTmap = vi.mocked(tmap.searchTmapPlaces);

function reset() {
  mockKakaoAvailable.mockReturnValue(true);
  mockSearchKakao.mockResolvedValue([]);
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

  it("진도식당 같은 동명 식당이 다른 주소에 있으면 후보를 모두 보존한다", async () => {
    mockSearchKakao.mockResolvedValue([
      { name: "진도식당", address: "서울 마포구 월드컵로 1", coordinate: at(0, 0) },
      { name: "진도식당", address: "서울 영등포구 여의대로 2", coordinate: at(1500, 0) },
    ]);
    mockSearchLocal.mockResolvedValue([
      { name: "진도식당", address: "서울 마포구 월드컵로 1", coordinate: at(8, 0) },
    ]);

    const { hits } = await searchDestinations("진도식당", null);
    expect(hits).toHaveLength(2);
    expect(hits.map((hit) => hit.address)).toEqual([
      "서울 마포구 월드컵로 1",
      "서울 영등포구 여의대로 2",
    ]);
    expect(hits.every((hit) => hit.distanceMeters === undefined)).toBe(true);
  });

  it("60m 이내의 동명 장소도 주소가 다르면 둘 다 선택 후보로 보존한다", async () => {
    mockSearchKakao.mockResolvedValue([
      { name: "진도식당", address: "서울 마포구 월드컵로 1", coordinate: at(0, 0) },
    ]);
    mockSearchLocal.mockResolvedValue([
      { name: "진도식당", address: "서울 마포구 월드컵로 3", coordinate: at(20, 0) },
    ]);

    const { hits } = await searchDestinations("진도식당", null);
    expect(hits.map((hit) => hit.address)).toEqual([
      "서울 마포구 월드컵로 1",
      "서울 마포구 월드컵로 3",
    ]);
  });

  it("동명·60m 이내의 동일 주소는 공백 차이가 있어도 한 번만 표시한다", async () => {
    mockSearchKakao.mockResolvedValue([
      { name: "진도식당", address: "서울 마포구  월드컵로 1", coordinate: at(0, 0) },
    ]);
    mockSearchLocal.mockResolvedValue([
      { name: "진도식당", address: " 서울 마포구 월드컵로 1 ", coordinate: at(20, 0) },
    ]);

    const { hits } = await searchDestinations("진도식당", null);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.address).toBe("서울 마포구  월드컵로 1");
  });

  it("주소 누락 후보 다음에 근접한 서로 다른 주소 2개가 와도 모두 보존한다", async () => {
    // 카카오/네이버 인터리브: 주소 없음 -> A -> B. 누락 주소는 A로 채우되 B를 버리면 안 된다.
    mockSearchKakao.mockResolvedValue([
      { name: "진도식당", coordinate: at(0, 0) },
      { name: "진도식당", address: "서울 마포구 월드컵로 3", coordinate: at(20, 0) },
    ]);
    mockSearchLocal.mockResolvedValue([
      { name: "진도식당", address: "서울 마포구 월드컵로 1", coordinate: at(10, 0) },
    ]);

    const { hits } = await searchDestinations("진도식당", null);
    expect(hits.map((hit) => hit.address)).toEqual([
      "서울 마포구 월드컵로 1",
      "서울 마포구 월드컵로 3",
    ]);
  });

  it("주소가 같아도 60m 밖의 동명 장소는 기존처럼 별도로 보존한다", async () => {
    mockSearchKakao.mockResolvedValue([
      { name: "진도식당", address: "서울 마포구 월드컵로 1", coordinate: at(0, 0) },
    ]);
    mockSearchLocal.mockResolvedValue([
      { name: "진도식당", address: "서울 마포구 월드컵로 1", coordinate: at(80, 0) },
    ]);

    const { hits } = await searchDestinations("진도식당", null);
    expect(hits).toHaveLength(2);
  });

  it("같은 지점에서 주소가 없는 공급자보다 주소가 있는 공급자 결과를 보존한다", async () => {
    mockSearchKakao.mockResolvedValue([{ name: "진도식당", coordinate: at(0, 0) }]);
    mockSearchLocal.mockResolvedValue([
      { name: "진도식당", address: "서울 마포구 월드컵로 1", coordinate: at(15, 0) },
    ]);
    const { hits } = await searchDestinations("진도식당", null);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.address).toBe("서울 마포구 월드컵로 1");
  });

  it("지하철역 후보를 가게·상호보다 앞에 둔다", async () => {
    // 실사용: '신촌' 검색에 신촌점이 신촌역보다 위에 뜨면 안 된다.
    mockSearchKakao.mockResolvedValue([
      { name: "이디야커피 신촌점", coordinate: at(40, 0), distanceMeters: 40 },
      { name: "신촌점", coordinate: at(30, 0), distanceMeters: 30 },
    ]);
    mockSearchLocal.mockResolvedValue([
      { name: "스타벅스 신촌점", coordinate: at(20, 0), distanceMeters: 20 },
    ]);
    mockSearchTmap.mockResolvedValue([
      { name: "신촌역", coordinate: at(200, 0), distanceMeters: 200 },
      { name: "신촌역2번출구", coordinate: at(210, 0), distanceMeters: 210 },
    ]);

    const { hits } = await searchDestinations("신촌", ORIGIN);

    expect(hits[0]?.name).toBe("신촌역");
    expect(hits[1]?.name).toBe("신촌역2번출구");
    expect(hits.map((h) => h.name).slice(0, 2)).toEqual(["신촌역", "신촌역2번출구"]);
    expect(hits.findIndex((h) => h.name.includes("점"))).toBeGreaterThan(1);
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
    mockSearchKakao.mockRejectedValue(new Error("kakao down"));
    mockSearchLocal.mockRejectedValue(new Error("naver down"));
    mockSearchTmap.mockResolvedValue([{ name: "서울시청", coordinate: at(0, 0) }]);

    const { hits } = await searchDestinations("시청", null);

    expect(hits.map((h) => h.name)).toEqual(["서울시청"]);
  });

  it("켜진 소스가 전부 실패하면 빈 목록으로 감추지 않고 오류를 낸다", async () => {
    mockSearchKakao.mockRejectedValue(new Error("kakao down"));
    mockSearchLocal.mockRejectedValue(new Error("naver down"));
    mockSearchTmap.mockRejectedValue(new Error("tmap down"));

    await expect(searchDestinations("시청", null)).rejects.toThrow();
  });

  it("키가 하나도 없으면 오류를 낸다 — '장소 없음'으로 보이면 안 된다", async () => {
    mockKakaoAvailable.mockReturnValue(false);
    mockNaverAvailable.mockReturnValue(false);
    mockTmapAvailable.mockReturnValue(false);

    await expect(searchDestinations("시청", null)).rejects.toThrow();
  });

  it("결과가 0건이면 빠진 소스를 이유로 함께 돌려준다", async () => {
    mockKakaoAvailable.mockReturnValue(false);
    mockNaverAvailable.mockReturnValue(false);   // 상호 검색 불가

    const { hits, hint } = await searchDestinations("동네치킨", null);

    expect(hits).toEqual([]);
    expect(hint).toContain("상호");
  });

  it("결과가 있으면 이유를 붙이지 않는다", async () => {
    mockKakaoAvailable.mockReturnValue(false);
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
    expect(sourceStatus()).toEqual({ kakaoLocal: true, naverLocal: true, tmap: true });
    expect(Object.values(sourceStatus()).every((v) => typeof v === "boolean")).toBe(true);
  });

  it("상호 소스가 둘 다 꺼졌을 때만 상호 검색을 짚는다", async () => {
    mockKakaoAvailable.mockReturnValue(false);
    mockNaverAvailable.mockReturnValue(false);
    mockTmapAvailable.mockReturnValue(false);

    expect(missingSourceHint()).toContain("상호");
  });

  it("한쪽만 켜져 있으면 상호 검색을 경고하지 않는다", async () => {
    mockNaverAvailable.mockReturnValue(false);   // 카카오만 켜짐

    expect(missingSourceHint()).toBeNull();
  });

  it("TMAP 만 없으면 TMAP 을 짚는다", async () => {
    mockTmapAvailable.mockReturnValue(false);

    expect(missingSourceHint()).toContain("TMAP");
  });

  it("다 있으면 덧붙일 말이 없다", async () => {
    expect(missingSourceHint()).toBeNull();
  });
});

describe("상호 소스 인터리브", () => {
  it("카카오와 네이버를 번갈아 섞는다 — 한쪽이 limit 을 다 먹지 않게", async () => {
    mockSearchKakao.mockResolvedValue([
      { name: "카카오1", coordinate: at(0, 0) },
      { name: "카카오2", coordinate: at(200, 0) },
    ]);
    mockSearchLocal.mockResolvedValue([
      { name: "네이버1", coordinate: at(0, 300) },
      { name: "네이버2", coordinate: at(200, 300) },
    ]);

    const { hits } = await searchDestinations("치킨", null);

    expect(hits.map((h) => h.name)).toEqual(["카카오1", "네이버1", "카카오2", "네이버2"]);
  });

  it("한 소스가 비면 다른 소스가 그 자리를 채운다", async () => {
    mockSearchKakao.mockResolvedValue([]);
    mockSearchLocal.mockResolvedValue([
      { name: "네이버1", coordinate: at(0, 0) },
      { name: "네이버2", coordinate: at(300, 0) },
    ]);

    const { hits } = await searchDestinations("치킨", null);

    expect(hits.map((h) => h.name)).toEqual(["네이버1", "네이버2"]);
  });

  it("상호 소스가 TMAP 보다 앞에 온다", async () => {
    mockSearchKakao.mockResolvedValue([{ name: "동네치킨", coordinate: at(0, 0) }]);
    mockSearchTmap.mockResolvedValue([{ name: "서울시청", coordinate: at(500, 0) }]);

    const { hits } = await searchDestinations("치킨", null);

    expect(hits.map((h) => h.name)).toEqual(["동네치킨", "서울시청"]);
  });
});

describe("주소 전용 결과와 상호 결과 중복", () => {
  it("같은 지점의 주소 지오코딩 결과는 상호 결과에 흡수된다(이름이 빠지지 않는다)", async () => {
    const { searchKakaoLocal } = await import("./kakao");
    const { searchTmapPlaces } = await import("./tmap");
    const { searchDestinations } = await import("./search");
    vi.mocked(searchKakaoLocal).mockResolvedValueOnce([
      { name: "IFC몰", address: "서울 영등포구 국제금융로 10", coordinate: at(0, 0) },
    ]);
    vi.mocked(searchTmapPlaces).mockResolvedValueOnce([
      { name: "서울 영등포구 여의도동 23", address: "서울 영등포구 여의도동 23", coordinate: at(5, 5) },
      { name: "서울 강남구 역삼동 1", address: "서울 강남구 역삼동 1", coordinate: at(5000, 0) },
    ]);
    const { hits } = await searchDestinations("국제금융로 10", ORIGIN);
    expect(hits.map((h) => h.name)).toEqual(["IFC몰", "서울 강남구 역삼동 1"]);
  });
});


describe("isLikelySubwayStation", () => {
  it("역·출구 이름은 참으로, 분점·상호는 거짓으로 본다", () => {
    expect(isLikelySubwayStation("신촌역")).toBe(true);
    expect(isLikelySubwayStation("신촌역 2번출구")).toBe(true);
    expect(isLikelySubwayStation("홍대입구역")).toBe(true);
    expect(isLikelySubwayStation("신촌점")).toBe(false);
    expect(isLikelySubwayStation("이디야커피 신촌점")).toBe(false);
    expect(isLikelySubwayStation("역전할머니맥주")).toBe(false);
  });
});

