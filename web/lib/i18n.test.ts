import { describe, expect, it } from "vitest";
import { getServiceMetadata, getServiceName, getUiText, getWorldCupMarketUiText, localeToSpeechLanguage, speechForState, speechForTurn } from "./i18n";

describe("K-Navi localization", () => {
  it("uses the requested service and market names in all four languages", () => {
    const markets = { ko: "망원동 월드컵시장", en: "Mangwon World Cup Market", ja: "望遠洞ワールドカップ市場", zh: "望远洞世界杯市场" };
    for (const locale of ["ko", "en", "ja", "zh"] as const) {
      const serviceName = locale === "ko" ? "케이트립" : "K-Trip";
      const ui = getWorldCupMarketUiText(locale);
      expect(getServiceName(locale)).toBe(serviceName);
      expect(ui.serviceName).toBe(serviceName);
      expect(ui.market).toBe(markets[locale]);
      expect(ui.marketMap).toContain(markets[locale]);
      expect(getServiceMetadata(locale, "worldcup-market").title).toBe(`${serviceName} — ${markets[locale]}`);
      expect(getServiceMetadata(locale, "worldcup-market").description).toContain(serviceName);
      expect(getServiceMetadata(locale, "home").title).toContain(serviceName);
      expect(getServiceMetadata(locale, "home").description).toContain(serviceName);
    }
  });

  it("provides localized map, detail and panorama labels and unconfirmed values", () => {
    const expected = {
      en: { storeList: "Store list", representativeMenu: "Featured menu", unknown: "Unconfirmed" },
      ja: { storeList: "店舗一覧", representativeMenu: "代表メニュー", unknown: "未確認" },
      zh: { storeList: "店铺列表", representativeMenu: "招牌菜单", unknown: "未确认" },
    };
    for (const locale of ["en", "ja", "zh"] as const) {
      const ui = getWorldCupMarketUiText(locale);
      expect(ui).toMatchObject(expected[locale]);
      expect(ui.unavailable).toBe(expected[locale].unknown);
      for (const value of Object.values(ui)) {
        if (typeof value === "string") {
          expect(value).not.toBe("");
          expect(value).not.toMatch(/[가-힣]/);
          expect(value).not.toContain("K-Navi");
        }
      }
      expect(ui.storesCount(45)).toContain("45");
      expect(ui.panoramaLoading).not.toBe(getWorldCupMarketUiText("ko").panoramaLoading);
      expect(ui.panoramaUpdatedNotice).not.toBe(getWorldCupMarketUiText("ko").panoramaUpdatedNotice);
    }
  });

  it("provides primary navigation labels in all required locales", () => {
    for (const locale of ["ko", "en", "ja", "zh"] as const) {
      const ui = getUiText(locale);
      expect(ui.homeTitle).not.toBe("");
      expect(ui.destination).not.toBe("");
      expect(ui.startWalking).not.toBe("");
      expect(ui.stop).not.toBe("");
      expect(ui.state("on_route")).not.toBe("");
      expect(localeToSpeechLanguage(locale)).toMatch(/-/);
    }
  });

  it("uses the server turn description only for Korean and localized speech otherwise", () => {
    expect(speechForTurn("ko", "left", "횡단보도 뒤 좌회전")).toBe("횡단보도 뒤 좌회전");
    expect(speechForTurn("en", "left", "횡단보도 뒤 좌회전")).toBe("Turn left.");
    expect(speechForTurn("ja", "right")).toContain("右");
    expect(speechForTurn("zh", "right")).toContain("右");
  });

  it("keeps deviation speech distinct from the normal on-route state", () => {
    expect(speechForState("en", "deviated")).toContain("left the route");
    expect(speechForState("ja", "passed_turn")).toContain("通り過ぎ");
    expect(speechForState("zh", "drifting")).toContain("偏离");
  });
});
