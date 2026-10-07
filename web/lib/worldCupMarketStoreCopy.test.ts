import { describe, expect, it } from "vitest";
import {
  formatKrwPrice,
  localizeDescription,
  localizeHours,
  localizeProductName,
  localizeStoreName,
} from "./worldCupMarketStoreCopy";
import { WORLD_CUP_MARKET_STORES } from "./worldCupMarketStores";

describe("월드컵시장 점포 표기", () => {
  it("영어·중국어 이름은 블로그 제목에 있을 때만 바꾸고 일본어 점포명은 한국어로 남긴다", () => {
    for (const store of WORLD_CUP_MARKET_STORES) {
      expect(localizeStoreName(store, "ko")).toBe(store.nameKo);
      expect(localizeStoreName(store, "en")).toBe(store.nameEn);
      expect(localizeStoreName(store, "ja")).toBe(store.nameKo);
      expect(localizeStoreName(store, "zh")).toBe(store.nameZh ?? store.nameKo);
      if (store.descriptionKo) {
        expect(localizeDescription(store.descriptionKo, "en")).toBe(store.descriptionKo);
        expect(localizeDescription(store.descriptionKo, "ja")).toBe(store.descriptionKo);
      }
      if (store.businessHours) {
        expect(localizeHours(store.businessHours, "zh")).toBe(store.businessHours);
      }
      for (const product of store.products) {
        expect(localizeProductName(product.nameKo, "ja")).toBe(product.nameKo);
      }
    }
    expect(localizeStoreName(WORLD_CUP_MARKET_STORES[1]!, "zh")).toBe("嘉樂農產物");
    expect(localizeStoreName(WORLD_CUP_MARKET_STORES[0]!, "zh")).toBe("부부야채");
  });

  it("한국어가 아닌 가격은 ₩로 표기하고 한국어는 원으로 표기한다", () => {
    expect(formatKrwPrice(1500, "ko")).toBe("1,500원");
    expect(formatKrwPrice(1500, "en")).toBe("₩1,500");
    expect(formatKrwPrice(1500, "ja")).toBe("₩1,500");
    expect(formatKrwPrice(1500, "zh")).toBe("₩1,500");
  });
});
