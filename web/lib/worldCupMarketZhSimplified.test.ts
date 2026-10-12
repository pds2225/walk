import { describe, expect, it } from "vitest";
import { getWorldCupMarketUiText } from "./i18n";
import { WORLD_CUP_MARKET_DESCRIPTIONS } from "./worldCupMarketDescriptions";
import { DETAIL_ADDRESS_COPY, DETAIL_HOURS_COPY, DETAIL_ORDER_COPY, DETAIL_PRODUCT_COPY } from "./worldCupMarketDetailCopy";
import { localizeCategory, localizeCategoryGroup, localizeStoreName } from "./worldCupMarketStoreCopy";
import {
  WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER,
  WORLD_CUP_MARKET_CATEGORY_GROUPS,
  WORLD_CUP_MARKET_STORES,
} from "./worldCupMarketStores";

// Traditional-only characters that must never appear in the Simplified Chinese UI.
const TRADITIONAL_DENYLIST = [..."麵腸飯燒雞魚豬點無門鋪開間時備認確單價"];

function zhStrings(): string[] {
  const ui = Object.values(getWorldCupMarketUiText("zh")).filter((value): value is string => typeof value === "string");
  const descriptions = Object.values(WORLD_CUP_MARKET_DESCRIPTIONS).map((copy) => copy.zh);
  const detail = [DETAIL_PRODUCT_COPY, DETAIL_ADDRESS_COPY, DETAIL_HOURS_COPY, DETAIL_ORDER_COPY]
    .flatMap((copy) => Object.values(copy).map((value) => value.zh));
  const stores = WORLD_CUP_MARKET_STORES.flatMap((store) => [localizeStoreName(store, "zh"), localizeCategory(store.category, "zh")]);
  const groups = WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER.map((group) => localizeCategoryGroup(group, "zh"));
  return [...ui, ...descriptions, ...detail, ...stores, ...groups].filter(Boolean);
}

describe("월드컵시장 중국어(간체) 표기", () => {
  it("중국어 문자열에 번체 전용 글자가 없다", () => {
    const offenders = zhStrings().filter((text) => TRADITIONAL_DENYLIST.some((char) => text.includes(char)));
    expect(offenders).toEqual([]);
  });

  it("시래기는 고사리(蕨)가 아니고 곱창은 소시지(香肠)가 아니다", () => {
    const all = zhStrings().join("\n");
    expect(all).not.toContain("蕨");
    expect(all).not.toContain("香肠");
    expect(localizeCategory("시래기", "zh")).not.toContain("蕨");
    expect(localizeCategory("곱창", "zh")).toBe("肥肠");
  });
});

describe("월드컵시장 업종 그룹", () => {
  it("모든 점포 업종이 6~8개 그룹 중 하나에 매핑되고 4개 언어 이름이 있다", () => {
    expect(WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER.length).toBeGreaterThanOrEqual(6);
    expect(WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER.length).toBeLessThanOrEqual(8);
    for (const store of WORLD_CUP_MARKET_STORES) {
      expect(WORLD_CUP_MARKET_CATEGORY_GROUPS[store.category], store.category).toBe(store.categoryGroup);
    }
    for (const group of WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER) {
      const labels = (["ko", "en", "ja", "zh"] as const).map((locale) => localizeCategoryGroup(group, locale));
      expect(new Set(labels).size, group).toBeGreaterThan(1);
      expect(WORLD_CUP_MARKET_STORES.some((store) => store.categoryGroup === group), group).toBe(true);
    }
  });

  it("일본어 업종 라벨이 중복되지 않는다 (野菜 / 野菜（ヤチェ）)", () => {
    const ja = [...new Set(WORLD_CUP_MARKET_STORES.map((store) => store.category))].map((category) => localizeCategory(category, "ja"));
    expect(ja).not.toContain("野菜（ヤチェ）");
  });
});
