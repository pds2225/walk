// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const trackMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/track", () => ({ track: trackMock }));

import WorldCupMarketFloorMap from "./WorldCupMarketFloorMap";
import { WORLD_CUP_MARKET_STORES } from "../lib/worldCupMarketStores";
import { GEO_CONSENT_TEXT } from "../lib/wcmGeoConsent";
import WorldCupMarketPrivacyPage from "../app/worldcup-market/privacy/page";

function stubGeo(impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) {
  const getCurrentPosition = vi.fn(impl);
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return getCurrentPosition;
}

afterEach(() => { cleanup(); trackMock.mockClear(); });

describe("월드컵시장 위치 수집 실제 고지", () => {
  it("4개 언어 동의문이 고정밀로 전송할 수 있는 위도·경도·정확도를 빠짐없이 고지한다", () => {
    const cases = [
      [GEO_CONSENT_TEXT.ko.after, "위도·경도", "정확도", "대략적인"],
      [GEO_CONSENT_TEXT.en.after, "latitude and longitude", "accuracy", "approximate"],
      [GEO_CONSENT_TEXT.ja.after, "緯度・経度", "精度", "おおよそ"],
      [GEO_CONSENT_TEXT.zh.after, "纬度、经度", "精度", "大致"],
    ];
    for (const [copy, coords, accuracy, misleading] of cases) {
      expect(copy).toContain(coords);
      expect(copy).toContain(accuracy);
      expect(copy).not.toContain(misleading);
    }
  });

  it("한국어·영어 개인정보 처리방침도 같은 고정밀 좌표 수집 사실을 명시한다", () => {
    const view = render(<WorldCupMarketPrivacyPage />);
    expect(view.getByText(/고정밀 GPS 좌표 포함 가능/)).toBeTruthy();
    expect(view.getByText(/precise GPS coordinates/)).toBeTruthy();
    expect(view.container.textContent).not.toContain("대략적인 위치");
    expect(view.container.textContent).not.toContain("approximate location");
  });
});

describe("WorldCupMarketFloorMap my location", () => {
  it("카테고리 필터 강조 시 목록을 지나 SVG 점포로 자동 스크롤하지 않는다", () => {
    stubGeo(() => {}); // 위치 업데이트가 없어도 필터만 검증
    const storeId = WORLD_CUP_MARKET_STORES[0]!.id;
    const bounds = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const visible = this.matches?.("a[data-store-id]") ?? false;
      return { width: visible ? 20 : 0, height: 20, top: 50, bottom: 70, left: 0, right: 20, x: 0, y: 50, toJSON: () => ({}) };
    });
    const previous = Object.getOwnPropertyDescriptor(SVGElement.prototype, "scrollIntoView");
    const scrollIntoView = vi.fn();
    Object.defineProperty(SVGElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    try {
      const props = { stores: WORLD_CUP_MARKET_STORES, locale: "ko" as const, onSelect: vi.fn(), selectedId: storeId };
      const { rerender } = render(<WorldCupMarketFloorMap {...props} highlightIds={new Set([storeId])} />);
      expect(scrollIntoView).not.toHaveBeenCalled();
      // '전체'로 필터 해제만 하면 기존 선택 점포로 화면이 튀지 않는다.
      rerender(<WorldCupMarketFloorMap {...props} highlightIds={null} />);
      expect(scrollIntoView).not.toHaveBeenCalled();
      // 필터 해제 후 새 점포를 직접 고른 경우에는 기존 스크롤을 유지한다.
      rerender(<WorldCupMarketFloorMap {...props} selectedId={WORLD_CUP_MARKET_STORES[1]!.id} highlightIds={null} />);
      expect(scrollIntoView).toHaveBeenCalled();
    } finally {
      if (previous) Object.defineProperty(SVGElement.prototype, "scrollIntoView", previous);
      else delete (SVGElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      bounds.mockRestore();
    }
  });


  it("전체 지도는 로드 시 위치를 자동 요청하고(클릭 이벤트 기록 없음) 페이지를 스크롤하지 않는다", async () => {
    const scrollTo = vi.fn(); window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    const get = stubGeo(() => {});
    render(<WorldCupMarketFloorMap stores={WORLD_CUP_MARKET_STORES} locale="ko" onSelect={vi.fn()} />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(trackMock).not.toHaveBeenCalledWith("my_location_click", expect.anything());
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("상세 지도는 위치를 요청하지 않는다", () => {
    const get = stubGeo(() => {});
    render(<WorldCupMarketFloorMap stores={WORLD_CUP_MARKET_STORES} locale="ko" onSelect={vi.fn()} variant="detail" selectedId={WORLD_CUP_MARKET_STORES[0]!.id} />);
    expect(get).not.toHaveBeenCalled();
  });

  it("권한 거부 시 기존 한 줄 안내만 보인다", async () => {
    stubGeo((_ok, fail) => fail({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "" } as GeolocationPositionError));
    render(<WorldCupMarketFloorMap stores={WORLD_CUP_MARKET_STORES} locale="ko" onSelect={vi.fn()} />);
    expect(await screen.findByText("위치 권한이 꺼져 있어요.")).toBeTruthy();
  });
  it("첫 위치에서 한 번 동의를 묻고, 동의하면 location_fix에 좌표를, 거절하면 아무것도 보내지 않는다", async () => {
    const { fireEvent } = await import("@testing-library/react");
    window.localStorage.clear();
    stubGeo((ok) => ok({ coords: { latitude: 37.5587, longitude: 126.905, accuracy: 12 } } as GeolocationPosition));
    const view = render(<WorldCupMarketFloorMap stores={WORLD_CUP_MARKET_STORES} locale="ko" onSelect={vi.fn()} />);
    const policy = await screen.findByRole("link", { name: "개인정보 처리방침" });
    expect(policy.getAttribute("href")).toBe("/worldcup-market/privacy");
    expect(policy.getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("button", { name: "동의 안 함" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "동의" }));
    expect(window.localStorage.getItem("wcm:geo-consent")).toBe("yes");
    expect(trackMock).toHaveBeenCalledWith("location_fix", expect.objectContaining({ src: "auto", geoConsent: true, position: expect.objectContaining({ latitude: 37.5587 }) }));
    view.unmount(); trackMock.mockClear();
    // Remembered: no prompt again, fixes keep being sent.
    render(<WorldCupMarketFloorMap stores={WORLD_CUP_MARKET_STORES} locale="ko" onSelect={vi.fn()} />);
    await waitFor(() => expect(trackMock).toHaveBeenCalledWith("location_fix", expect.anything()));
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup(); trackMock.mockClear();
    window.localStorage.clear();
    render(<WorldCupMarketFloorMap stores={WORLD_CUP_MARKET_STORES} locale="ja" onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "同意しない" }));
    expect(window.localStorage.getItem("wcm:geo-consent")).toBe("no");
    expect(trackMock).not.toHaveBeenCalledWith("location_fix", expect.anything());
    expect(screen.getByText("地図に青い点で表示しました。")).toBeTruthy();
  });
});
