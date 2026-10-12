import { describe, expect, it } from "vitest";
import { localeFromAcceptLanguage, qrDestinationPath, storeIdFromQrNumber, storeNumberFromId } from "./qrScan";

describe("qrScan mapping", () => {
  it("maps stall numbers to the 45 known ids", () => {
    expect(storeIdFromQrNumber("1")).toBe("worldcup-market-01");
    expect(storeIdFromQrNumber("23")).toBe("worldcup-market-23");
    expect(storeIdFromQrNumber("045")).toBe("worldcup-market-45");
    expect(storeIdFromQrNumber("46")).toBeNull();
    expect(storeIdFromQrNumber("0")).toBeNull();
    expect(storeIdFromQrNumber("abc")).toBeNull();
    expect(storeNumberFromId("worldcup-market-07")).toBe(7);
    expect(qrDestinationPath("worldcup-market-23")).toBe("/worldcup-market?store=worldcup-market-23");
  });

  it("reads locale from accept-language by q order", () => {
    expect(localeFromAcceptLanguage("ja-JP,ja;q=0.9,en;q=0.8")).toBe("ja");
    expect(localeFromAcceptLanguage("fr;q=0.9,zh-CN;q=0.8")).toBe("zh");
    expect(localeFromAcceptLanguage("en;q=0.5,ko;q=0.9")).toBe("ko");
    expect(localeFromAcceptLanguage("fr")).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
  });
});
