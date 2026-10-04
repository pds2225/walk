import { describe, expect, it } from "vitest";
import { WORLD_CUP_MARKET_STORES, getWorldCupMarketStore, isWorldCupMarketCoordinate } from "./worldCupMarketStores";

const BLOG = "https://m.blog.naver.com/mwwdc/";

describe("월드컵시장 블로그 점포", () => {
  it("블로그 매장 01–45만 포함하고 다른 출처 점포는 없다", () => {
    expect(WORLD_CUP_MARKET_STORES).toHaveLength(45);
    expect(new Set(WORLD_CUP_MARKET_STORES.map((store) => store.id)).size).toBe(45);
    for (const store of WORLD_CUP_MARKET_STORES) {
      expect(store.id.startsWith("worldcup-market-")).toBe(true);
      expect(store.officialSource?.startsWith(BLOG)).toBe(true);
      expect(store.businessHoursSource).toBe(store.officialSource);
      expect(store.purchaseInfo.sourceUrl).toBe(store.officialSource);
      expect(store.google.placeId).toBeNull();
      expect(store.google.webReference).toBeNull();
      expect(store.google.mapsUrl).toBeNull();
    }
  });

  it("글에 없는 가격·사진 권리와 미확인 파노 정보는 임의로 채우지 않는다", () => {
    for (const store of WORLD_CUP_MARKET_STORES) {
      if (store.streetView.available) {
        expect(store.streetView.lastResolvedPanoId).toBeTruthy();
        expect(store.streetViewLocation).not.toBeNull();
        expect(isWorldCupMarketCoordinate(store.streetViewLocation!)).toBe(true);
        expect(store.streetViewLocation).toEqual({ latitude: store.streetView.latitude, longitude: store.streetView.longitude });
        expect(store.streetView.provider).toBe("NAVER");
        expect(store.streetView.metadataSource).toContain("naver.maps.Panorama");
        expect(store.streetView.captureDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
        expect(store.streetView.distanceFromStore).not.toBeNull();
        expect(store.streetView.distanceFromStore).toBeGreaterThanOrEqual(0);
        expect(store.streetView.distanceFromStore).toBeLessThanOrEqual(50);
        expect(store.streetView.lastCheckedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(store.streetView.quality).not.toBe("EXACT_FRONTAGE");
      } else {
        expect(store.streetView.lastResolvedPanoId).toBeNull();
        expect(store.streetView.latitude).toBeNull();
        expect(store.streetView.longitude).toBeNull();
        expect(store.streetViewLocation).toBeNull();
      }
      expect(store.verification.prices).toBe("UNKNOWN");
      expect(store.verification.images).toBe("RIGHTS_CHECK_REQUIRED");
      expect(store.representativeMenu?.priceWon ?? null).toBeNull();
      for (const product of store.products) {
        expect(product.priceKrw).toBeNull();
        expect(product.priceLabel).toBeNull();
      }
      for (const image of store.storeImages) {
        expect(image.usageStatus).toBe("RIGHTS_CHECK_REQUIRED");
        expect(image.sourceUrl).toBe(store.officialSource);
        expect(image.attribution).toContain("m.blog.naver.com/mwwdc");
        expect(image.url).toContain("pstatic.net");
      }
    }
  });

  it("좌표는 시장 근처 범위이며 각 점포의 주소·출처·확인 날짜를 반드시 갖는다", () => {
    for (const store of WORLD_CUP_MARKET_STORES) {
      const location = store.storeLocation;
      if (!location) {
        expect(store.navigationTarget).toBeNull();
        expect(store.verification.location).toBe("UNKNOWN");
        continue;
      }
      expect(isWorldCupMarketCoordinate(location)).toBe(true);
      expect(location.coordSource).toBe("blog-address+naver-geocode");
      expect(location.evidenceAddress).toContain("마포구");
      expect(location.geocodedAddress).toContain("서울특별시 마포구");
      const roadAndNumber = store.address.match(/(망원로7길|망원로|월드컵로25길)\s*(\d+(?:-\d+)?)/);
      expect(roadAndNumber).not.toBeNull();
      expect(location.evidenceAddress).toContain(`${roadAndNumber![1]} ${roadAndNumber![2]}`);
      expect(location.sourceUrl).toBe(store.officialSource);
      expect(location.source).toBe("https://maps.apigw.ntruss.com/map-geocode/v2/geocode");
      expect(location.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (location.evidenceType === "BLOG_IMAGE") expect(location.evidenceImageUrl).toMatch(/^https:\/\/mblogthumb-phinf\.pstatic\.net\//);
      expect(store.navigationTarget).toEqual(location);
    }
  });

  it("범위 밖/잘못된 수치와 위경도를 바꿔 넣은 값은 거부한다", () => {
    const valid = { latitude: 37.5587334, longitude: 126.9050734 };
    expect(isWorldCupMarketCoordinate(valid)).toBe(true);
    for (const invalid of [
      { latitude: 37.5539, longitude: valid.longitude },
      { latitude: 37.5626, longitude: valid.longitude },
      { latitude: valid.latitude, longitude: 126.8999 },
      { latitude: valid.latitude, longitude: 126.9101 },
      { latitude: Number.NaN, longitude: valid.longitude },
      { latitude: valid.latitude, longitude: Number.POSITIVE_INFINITY },
      { latitude: valid.longitude, longitude: valid.latitude },
    ]) expect(isWorldCupMarketCoordinate(invalid)).toBe(false);
  });

  it("같은 건물의 점포를 임의로 흩뜨리지 않고 호수 근거를 유지한다", () => {
    const groups = new Map<string, { latitude: number; longitude: number }>();
    for (const store of WORLD_CUP_MARKET_STORES) {
      if (!store.storeLocation) continue;
      const location = store.storeLocation;
      const coordinate = { latitude: location.latitude, longitude: location.longitude };
      const previous = groups.get(location.geocodedAddress);
      if (previous) expect(coordinate).toEqual(previous);
      groups.set(location.geocodedAddress, coordinate);
    }
    expect(getWorldCupMarketStore("worldcup-market-14")?.storeLocation?.evidenceAddress).toContain("102호");
  });

  it("부부야채와 장터국밥, 재희네맛김은 블로그 글의 주소·시간·전화만 담는다", () => {
    const bubu = getWorldCupMarketStore("worldcup-market-01");
    expect(bubu?.nameKo).toBe("부부야채");
    expect(bubu?.nameEn).toBe("Bubu Vegetables");
    expect(bubu?.nameZh).toBeNull();
    expect(bubu?.address).toBe("서울 마포구 망원로7길 31");
    expect(bubu?.businessHours).toBe("08:00 ~ 19:00 (일요일 휴무)");
    expect(bubu?.phone).toBe("02-2601-1777");
    expect(bubu?.officialSource).toBe(`${BLOG}224412430654`);
    expect(bubu?.products.map((product) => product.nameKo)).toEqual(["고구마", "연근", "오이"]);

    const gukbap = getWorldCupMarketStore("worldcup-market-45");
    expect(gukbap?.nameKo).toBe("장터국밥");
    expect(gukbap?.nameEn).toBe("Jangteo Gukbap");
    expect(gukbap?.nameZh).toBe("市場湯飯");
    expect(gukbap?.phone).toBeNull();
    expect(gukbap?.products.map((product) => product.nameKo)).toEqual(["육개장", "선지국"]);
    expect(gukbap?.officialSource).toBe(`${BLOG}224413884748`);

    const gim = getWorldCupMarketStore("worldcup-market-40");
    expect(gim?.address).toBe("서울 마포구 망원로 81 1층");
    expect(gim?.phone).toBe("0110-3182-1665");
    expect(gim?.businessHours).toBe("08:30 ~ 20:00 (2,4주 수 휴무)");
  });
});
