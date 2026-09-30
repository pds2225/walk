// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import { WORLD_CUP_MARKET_STORES, type WorldCupMarketStore } from "../lib/worldCupMarketStores";
import WorldCupMarketStreetView from "./WorldCupMarketStreetView";

const LOCALES: readonly Locale[] = ["ko", "en", "ja", "zh"];

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function withCoordinate(store: WorldCupMarketStore): WorldCupMarketStore {
  return {
    ...store,
    storeLocation: {
      latitude: 35.1,
      longitude: 127.2,
      source: "component test fixture",
      verifiedAt: "2026-09-30",
      verificationStatus: "UNKNOWN",
    },
    streetView: { ...store.streetView, available: true, lastResolvedPanoId: "pano-test" },
  };
}

describe("WorldCupMarketStreetView", () => {
  it("블로그 점포는 좌표가 없어 키가 있어도 거리뷰를 열지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const store = WORLD_CUP_MARKET_STORES[0];
    if (!store) throw new Error("점포가 없습니다");
    render(<WorldCupMarketStreetView store={store} locale="ko" />);
    expect(screen.getByText("사용 가능한 점포 정면뷰가 없습니다")).toBeTruthy();
    expect(screen.getByText("지도와 K-Navi 도보안내는 계속 사용할 수 있습니다.")).toBeTruthy();
    expect(screen.queryByTitle(/거리 뷰/)).toBeNull();
  });

  it("좌표와 영상이 있으면 네 언어 모두 확인된 정면이 아니라 점포 근처 거리뷰라고 적는다", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const store = WORLD_CUP_MARKET_STORES[0];
    if (!store) throw new Error("점포가 없습니다");
    const located = withCoordinate(store);

    for (const locale of LOCALES) {
      const ui = getWorldCupMarketUiText(locale);
      const view = render(<WorldCupMarketStreetView store={located} locale={locale} />);
      expect(screen.getByText(ui.storeStreetViewDescription)).toBeTruthy();
      const frame = screen.getByTitle(`${localizeStoreName(located, locale)} ${ui.storefrontTitle}`);
      expect(frame.getAttribute("src")).toContain("pano=pano-test");
      expect(frame.getAttribute("src")).toContain("location=35.1%2C127.2");
      view.unmount();
    }
  });
});
