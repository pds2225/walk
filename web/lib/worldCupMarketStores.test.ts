import { describe, expect, it } from "vitest";
import { WORLD_CUP_MARKET_STORES, getWorldCupMarketStore } from "./worldCupMarketStores";

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

  it("글에 없는 좌표, 파노라마, 가격은 비워 둔다", () => {
    for (const store of WORLD_CUP_MARKET_STORES) {
      expect(store.storeLocation).toBeNull();
      expect(store.navigationTarget).toBeNull();
      expect(store.streetView.available).toBe(false);
      expect(store.streetView.lastResolvedPanoId).toBeNull();
      expect(store.streetView.latitude).toBeNull();
      expect(store.streetView.longitude).toBeNull();
      expect(store.verification.location).toBe("UNKNOWN");
      expect(store.verification.navigationTarget).toBe("UNKNOWN");
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
