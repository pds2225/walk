import { describe, expect, it } from "vitest";
import {
  formatKrwPrice,
  getStoreNameReading,
  localizeAddress,
  localizeCategory,
  localizeDescription,
  localizeHours,
  localizeOrderNote,
  localizePriceLabel,
  localizeProduct,
  localizeProductName,
  localizeStoreName,
} from "./worldCupMarketStoreCopy";
import { getWorldCupMarketUiText } from "./i18n";
import { WORLD_CUP_MARKET_STORES } from "./worldCupMarketStores";
import { WORLD_CUP_MARKET_NAME_READINGS } from "./worldCupMarketNameReadings";

describe("월드컵시장 점포 표기", () => {
  it("원본 업종 데이터는 보존하고 지도 필터와 카드의 업종 라벨만 번역한다", () => {
    const originalCategories = WORLD_CUP_MARKET_STORES.map((store) => store.category);
    for (const category of new Set(originalCategories)) {
      expect(localizeCategory(category, "ko")).toBe(category);
      for (const locale of ["en", "ja", "zh"] as const) {
        expect(localizeCategory(category, locale)).not.toBe(category);
        expect(localizeCategory(category, locale)).not.toMatch(/[가-힣]/);
      }
    }
    expect(WORLD_CUP_MARKET_STORES.map((store) => store.category)).toEqual(originalCategories);
    expect(localizeCategory("채소", "ja")).toBe("野菜");
    expect(localizeCategory("미확인", "ja")).toBe("未確認");
    expect(localizeCategory("미확인", "en")).toBe("Unconfirmed");
    expect(localizeCategory("미확인", "zh")).toBe("未确认");
    expect(localizeCategory("source category not yet translated", "ja")).toBe("source category not yet translated");
  });

  it("블로그에 확인된 영어·중국어 고유명과 한국어 원본 이름을 보존한다", () => {
    for (const store of WORLD_CUP_MARKET_STORES) {
      expect(localizeStoreName(store, "ko")).toBe(store.nameKo);
      expect(localizeStoreName(store, "en")).toBe(store.nameEn);
      expect(localizeStoreName(store, "ja")).toBe(store.nameKo);
      expect(localizeStoreName(store, "zh")).toBe(store.nameZh ?? store.nameKo);
    }
    expect(localizeStoreName(WORLD_CUP_MARKET_STORES[1]!, "zh")).toBe("嘉乐农产物");
    expect(localizeStoreName(WORLD_CUP_MARKET_STORES[0]!, "zh")).toBe("부부야채");
  });

  it("JA에서만 한글 상점명 옆에 가타카나 읽기를 덧붙이고, 다른 언어에는 없다", () => {
    for (const store of WORLD_CUP_MARKET_STORES) {
      expect(getStoreNameReading(store, "ja")).toBe(WORLD_CUP_MARKET_NAME_READINGS[store.id]);
      expect(getStoreNameReading(store, "ko")).toBeNull();
      expect(getStoreNameReading(store, "en")).toBeNull();
      expect(getStoreNameReading(store, "zh")).toBeNull();
    }
  });

  it("한국어 설명·메뉴·시간·메모·주소·가격 표기는 수집된 원문을 유지한다", () => {
    for (const store of WORLD_CUP_MARKET_STORES) {
      expect(localizeDescription(store.descriptionKo, "ko")).toBe(store.descriptionKo);
      expect(localizeHours(store.businessHours, "ko")).toBe(store.businessHours);
      expect(localizeOrderNote(store.purchaseInfo.orderNote, "ko")).toBe(store.purchaseInfo.orderNote);
      expect(localizeAddress(store.address, "ko")).toBe(store.address);
      if (store.representativeMenu) {
        expect(localizeProductName(store.representativeMenu.nameKo, "ko")).toBe(store.representativeMenu.nameKo);
      }
      for (const product of store.products) {
        expect(localizeProductName(product.nameKo, "ko")).toBe(product.nameKo);
        expect(localizePriceLabel(product.priceLabel, "ko")).toBe(product.priceLabel);
        expect(localizeProduct(product, "ko")).toBe(product);
      }
    }
  });

  it.each(["en", "ja", "zh"] as const)("%s: 45개 점포 본문을 번역하며 원본 사실과 미확인 값을 보존한다", (locale) => {
    const before = JSON.stringify(WORLD_CUP_MARKET_STORES);
    const ui = getWorldCupMarketUiText(locale);
    expect(WORLD_CUP_MARKET_STORES).toHaveLength(45);
    for (const store of WORLD_CUP_MARKET_STORES) {
      const copy = {
        description: localizeDescription(store.descriptionKo, locale),
        hours: localizeHours(store.businessHours, locale),
        orderNote: localizeOrderNote(store.purchaseInfo.orderNote, locale),
        address: localizeAddress(store.address, locale),
        category: localizeCategory(store.category, locale),
      };
      for (const [field, value] of Object.entries(copy)) {
        if (value === null) continue;
        expect(value.trim(), `${store.id} ${field}`).not.toBe("");
        expect(value, `${store.id} ${field}`).not.toMatch(/[가-힣]/);
        expect(value, `${store.id} ${field}`).not.toBe(ui.unknown);
      }
      if (store.descriptionKo) expect(copy.description).not.toBe(store.descriptionKo);
      expect(copy.address).not.toBe(store.address);
      if (store.representativeMenu) {
        const menuName = localizeProductName(store.representativeMenu.nameKo, locale);
        expect(menuName, `${store.id} representative menu`).not.toMatch(/[가-힣]/);
        expect(menuName).not.toBe(ui.unknown);
      }
      for (const product of store.products) {
        const translated = localizeProduct(product, locale);
        expect(translated.nameKo.trim(), `${store.id} ${product.nameKo}`).not.toBe("");
        expect(translated.nameKo, `${store.id} ${product.nameKo}`).not.toMatch(/[가-힣]/);
        expect(translated.nameKo).not.toBe(ui.unknown);
        expect(translated.nameKo).toBe(localizeProductName(product.nameKo, locale));
        const originalNumbers = product.nameKo.match(/\d+(?:[.,]\d+)?/g) ?? [];
        const translatedNumbers = translated.nameKo.match(/\d+(?:[.,]\d+)?/g) ?? [];
        expect(translatedNumbers, `${store.id} product amounts`).toEqual(originalNumbers);
        expect(translated.priceKrw).toBe(product.priceKrw);
        const priceLabel = localizePriceLabel(product.priceLabel, locale);
        if (product.priceLabel === null) expect(priceLabel).toBeNull();
        else expect(priceLabel, `${store.id} price label`).not.toMatch(/[가-힣]/);
      }
    }
    expect(JSON.stringify(WORLD_CUP_MARKET_STORES)).toBe(before);
  });

  it.each(["en", "ja", "zh"] as const)("%s: 정보 없음은 새 사실을 만들지 않고 null 또는 현지어 미확인으로 표시한다", (locale) => {
    const ui = getWorldCupMarketUiText(locale);
    for (const localize of [localizeDescription, localizeHours, localizeOrderNote, localizePriceLabel]) {
      expect(localize(null, locale)).toBeNull();
      expect(localize("미확인", locale)).toBe(ui.unknown);
    }
    expect(localizeProductName("미확인", locale)).toBe(ui.unknown);
    expect(localizeCategory("미확인", locale)).toBe(ui.unknown);
    expect(localizeAddress("미확인", locale)).toBe(ui.unknown);
  });

  it("한국어가 아닌 가격은 ₩로 표기하고 한국어는 원으로 표기한다", () => {
    expect(formatKrwPrice(1500, "ko")).toBe("1,500원");
    expect(formatKrwPrice(1500, "en")).toBe("₩1,500");
    expect(formatKrwPrice(1500, "ja")).toBe("₩1,500");
    expect(formatKrwPrice(1500, "zh")).toBe("₩1,500");
  });
});
