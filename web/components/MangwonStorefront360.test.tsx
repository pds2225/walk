// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMangwonUiText, type Locale } from "../lib/i18n";
import { MANGWON_STORES } from "../lib/mangwonStores";
import { localizeStoreName } from "../lib/mangwonStoreCopy";
import MangwonStorefront360 from "./MangwonStorefront360";

const LOCALES: readonly Locale[] = ["ko", "en", "ja", "zh"];

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("MangwonStorefront360", () => {
  it("네 언어 모두 확인된 정면이 아니라 점포 근처 거리뷰라고 적는다", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const store = MANGWON_STORES[0];
    if (!store) throw new Error("점포가 없습니다");

    for (const locale of LOCALES) {
      const ui = getMangwonUiText(locale);
      const view = render(<MangwonStorefront360 store={store} locale={locale} />);
      expect(screen.getByText(ui.storeStreetViewDescription)).toBeTruthy();
      expect(screen.getByTitle(`${localizeStoreName(store, locale)} ${ui.storefrontTitle}`)).toBeTruthy();
      view.unmount();
    }
  });

  it("영상이 없으면 키가 있어도 기존 미표시 문구를 유지한다", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const store = MANGWON_STORES[0];
    if (!store) throw new Error("점포가 없습니다");
    render(
      <MangwonStorefront360
        store={{ ...store, streetView: { ...store.streetView, available: false } }}
        locale="ko"
      />,
    );
    expect(screen.getByText("사용 가능한 점포 정면뷰가 없습니다")).toBeTruthy();
    expect(screen.getByText("지도와 K-Navi 도보안내는 계속 사용할 수 있습니다.")).toBeTruthy();
    expect(screen.queryByTitle(/거리 뷰/)).toBeNull();
  });
});
