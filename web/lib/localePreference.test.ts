// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  localeFromBrowserLanguages,
  localeFromSearch,
  readStoredLocale,
  resolveInitialLocale,
  syncLocaleToUrl,
  writeStoredLocale,
} from "./localePreference";

function stubLanguages(languages: readonly string[]) {
  Object.defineProperty(window.navigator, "languages", { configurable: true, value: languages });
  Object.defineProperty(window.navigator, "language", { configurable: true, value: languages[0] ?? "en" });
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/worldcup-market");
});

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("localeFromSearch", () => {
  it("?lang= 값이 지원 언어면 그대로 반환한다", () => {
    expect(localeFromSearch("?lang=ja")).toBe("ja");
    expect(localeFromSearch("?lang=zh&store=worldcup-market-01")).toBe("zh");
  });

  it("값이 없거나 지원하지 않는 언어면 null을 반환한다", () => {
    expect(localeFromSearch("")).toBeNull();
    expect(localeFromSearch("?lang=fr")).toBeNull();
    expect(localeFromSearch("?store=worldcup-market-01")).toBeNull();
  });
});

describe("localeFromBrowserLanguages", () => {
  it("ko/en/ja/zh 접두사를 매핑한다", () => {
    expect(localeFromBrowserLanguages(["ja-JP", "en-US"])).toBe("ja");
    expect(localeFromBrowserLanguages(["zh-TW"])).toBe("zh");
    expect(localeFromBrowserLanguages(["ko-KR"])).toBe("ko");
    expect(localeFromBrowserLanguages(["en-GB"])).toBe("en");
  });

  it("지원하지 않는 언어만 있으면 null을 반환한다", () => {
    expect(localeFromBrowserLanguages(["fr-FR", "de-DE"])).toBeNull();
    expect(localeFromBrowserLanguages([])).toBeNull();
  });
});

describe("readStoredLocale / writeStoredLocale", () => {
  it("저장한 값을 그대로 읽어온다", () => {
    writeStoredLocale("zh");
    expect(readStoredLocale()).toBe("zh");
  });

  it("저장된 값이 없으면 null을 반환한다", () => {
    expect(readStoredLocale()).toBeNull();
  });

  it("손상된 값이 저장돼 있으면 무시한다", () => {
    window.localStorage.setItem("walk:locale", "not-a-locale");
    expect(readStoredLocale()).toBeNull();
  });
});

describe("resolveInitialLocale 우선순위", () => {
  it("URL ?lang= 이 저장된 값과 브라우저 언어보다 우선한다", () => {
    writeStoredLocale("en");
    stubLanguages(["ja-JP"]);
    window.history.replaceState(null, "", "/worldcup-market?lang=zh");
    expect(resolveInitialLocale()).toBe("zh");
  });

  it("URL이 없으면 저장된 값이 브라우저 언어보다 우선한다", () => {
    writeStoredLocale("en");
    stubLanguages(["ja-JP"]);
    window.history.replaceState(null, "", "/worldcup-market");
    expect(resolveInitialLocale()).toBe("en");
  });

  it("URL과 저장값이 없으면 브라우저 언어를 사용한다", () => {
    stubLanguages(["ja-JP", "en-US"]);
    window.history.replaceState(null, "", "/worldcup-market");
    expect(resolveInitialLocale()).toBe("ja");
  });

  it("아무 소스도 없으면 ko로 기본값을 쓴다", () => {
    stubLanguages(["fr-FR"]);
    window.history.replaceState(null, "", "/worldcup-market");
    expect(resolveInitialLocale()).toBe("ko");
  });
});

describe("syncLocaleToUrl", () => {
  it("history 항목을 새로 쌓지 않고 lang 파라미터만 갱신한다", () => {
    window.history.replaceState(null, "", "/worldcup-market?store=worldcup-market-01");
    const lengthBefore = window.history.length;
    syncLocaleToUrl("ja");
    expect(window.history.length).toBe(lengthBefore);
    expect(window.location.search).toContain("lang=ja");
    expect(window.location.search).toContain("store=worldcup-market-01");
  });
});
