// @vitest-environment jsdom
// Fix 2 통합 테스트: 페이지 레벨에서 locale 해석 우선순위와 ?lang= 동기화가
// 실제로 연결돼 있는지 확인한다. 세부 우선순위 규칙 자체는 lib/localePreference.test.ts에서 다룬다.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "../../lib/i18n";
import WorldCupMarketDemoPage from "./page";

vi.mock("../../components/WorldCupMarketDemo", () => ({
  default: ({ locale, onLocaleChange }: { locale: Locale; onLocaleChange?: (locale: Locale) => void }) => (
    <div data-testid="demo" data-locale={locale}>
      <button onClick={() => onLocaleChange?.("ja")}>switch-to-ja</button>
    </div>
  ),
}));

vi.mock("../../components/DestinationWalk", () => ({
  default: () => <div data-testid="destination-walk" />,
}));

function stubLanguages(languages: readonly string[]) {
  Object.defineProperty(window.navigator, "languages", { configurable: true, value: languages });
  Object.defineProperty(window.navigator, "language", { configurable: true, value: languages[0] ?? "en" });
}

beforeEach(() => {
  window.localStorage.clear();
  stubLanguages(["ko-KR"]);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("월드컵시장 페이지: 언어 유지 (Fix 2)", () => {
  it("저장된 언어·URL이 없으면 브라우저 언어를 따른다", () => {
    stubLanguages(["ja-JP"]);
    window.history.replaceState(null, "", "/worldcup-market");
    render(<WorldCupMarketDemoPage />);
    expect(screen.getByTestId("demo").getAttribute("data-locale")).toBe("ja");
  });

  it("URL의 ?lang= 이 저장된 값과 브라우저 언어보다 우선한다", () => {
    window.localStorage.setItem("walk:locale", "en");
    stubLanguages(["ja-JP"]);
    window.history.replaceState(null, "", "/worldcup-market?lang=zh");
    render(<WorldCupMarketDemoPage />);
    expect(screen.getByTestId("demo").getAttribute("data-locale")).toBe("zh");
  });

  it("저장된 언어가 있으면 브라우저 언어보다 우선한다", () => {
    window.localStorage.setItem("walk:locale", "zh");
    stubLanguages(["ja-JP"]);
    window.history.replaceState(null, "", "/worldcup-market");
    render(<WorldCupMarketDemoPage />);
    expect(screen.getByTestId("demo").getAttribute("data-locale")).toBe("zh");
  });

  it("언어를 바꾸면 localStorage와 URL(?lang=)에 반영되고 store 파라미터와 history를 보존한다", () => {
    window.history.replaceState(null, "", "/worldcup-market?store=worldcup-market-01");
    render(<WorldCupMarketDemoPage />);
    const lengthBefore = window.history.length;

    fireEvent.click(screen.getByText("switch-to-ja"));

    expect(screen.getByTestId("demo").getAttribute("data-locale")).toBe("ja");
    expect(window.localStorage.getItem("walk:locale")).toBe("ja");
    expect(window.location.search).toContain("lang=ja");
    expect(window.location.search).toContain("store=worldcup-market-01");
    expect(window.history.length).toBe(lengthBefore);
  });
});
