import { describe, expect, it } from "vitest";
import { MANGWON_STORES } from "./mangwonStores";
import {
  formatKrwPrice,
  localizeCategory,
  localizeDescription,
  localizeHours,
  localizeOrderNote,
  localizePriceLabel,
  localizeProductName,
  localizeStoreName,
} from "./mangwonStoreCopy";

const FOREIGN_LOCALES = ["ja", "zh"] as const;

describe("망원시장 데모 점포 번역", () => {
  it("ja와 zh는 점포명·분류·설명·영업시간·주문 메모·메뉴·가격 라벨을 한국어 원문과 다르게 보여준다", () => {
    for (const locale of FOREIGN_LOCALES) {
      for (const store of MANGWON_STORES) {
        expect(localizeStoreName(store, locale)).not.toBe(store.nameKo);
        expect(localizeCategory(store.category, locale)).not.toBe(store.category);
        if (store.descriptionKo) {
          expect(localizeDescription(store.descriptionKo, locale)).not.toBe(store.descriptionKo);
        }
        if (store.businessHours) {
          expect(localizeHours(store.businessHours, locale)).not.toBe(store.businessHours);
        }
        if (store.purchaseInfo.orderNote) {
          expect(localizeOrderNote(store.purchaseInfo.orderNote, locale)).not.toBe(store.purchaseInfo.orderNote);
        }
        if (store.representativeMenu) {
          expect(localizeProductName(store.representativeMenu.nameKo, locale)).not.toBe(store.representativeMenu.nameKo);
        }
        for (const product of store.products) {
          expect(localizeProductName(product.nameKo, locale), `${locale} ${product.nameKo}`).not.toBe(product.nameKo);
          if (product.priceLabel) {
            expect(localizePriceLabel(product.priceLabel, locale)).not.toBe(product.priceLabel);
          }
        }
      }
    }
  });

  it("한국어가 아닌 가격은 ₩로 표기하고 한국어는 원으로 표기한다", () => {
    expect(formatKrwPrice(1500, "ko")).toBe("1,500원");
    expect(formatKrwPrice(1500, "en")).toBe("₩1,500");
    expect(formatKrwPrice(1500, "ja")).toBe("₩1,500");
    expect(formatKrwPrice(1500, "zh")).toBe("₩1,500");
  });
});
