// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getWorldCupMarketUiText } from "../lib/i18n";
import { WORLD_CUP_MARKET_STATIC_MAP } from "../lib/worldCupMarketStaticMap";
import { WORLD_CUP_MARKET_STORES } from "../lib/worldCupMarketStores";
import WorldCupMarketStaticMap from "./WorldCupMarketStaticMap";

const naver = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../lib/roadview", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/roadview")>(),
  loadNaverMaps: naver.load,
}));

afterEach(() => {
  cleanup();
  naver.load.mockReset();
});

describe("WorldCupMarketStaticMap", () => {
  it("고정 이미지 위에 45개 핀을 그리고 NAVER 지도 SDK를 불러오지 않는다", () => {
    const { container } = render(<WorldCupMarketStaticMap stores={WORLD_CUP_MARKET_STORES} selectedId="" onSelect={vi.fn()} locale="ko" />);
    const region = screen.getByRole("region", { name: getWorldCupMarketUiText("ko").marketMap });
    expect(region.getAttribute("data-map-provider")).toBe("static");
    expect(container.querySelector("img.worldcup-market-static-map-image")?.getAttribute("src")).toBe(WORLD_CUP_MARKET_STATIC_MAP.src);
    expect(container.querySelectorAll(".worldcup-market-overview-pin")).toHaveLength(45);
    expect(within(region).getByRole("link", { name: "© OpenStreetMap contributors" })).toBeTruthy();
    expect(naver.load).not.toHaveBeenCalled();
    expect(document.querySelector('script[src*="oapi.map.naver.com"]')).toBeNull();
  });

  it("핀을 누르면 점포를 고르고, 대략 위치와 언어별 이름을 안내한다", () => {
    const onSelect = vi.fn();
    const { container } = render(<WorldCupMarketStaticMap stores={WORLD_CUP_MARKET_STORES} selectedId="" onSelect={onSelect} locale="ja" />);
    const first = WORLD_CUP_MARKET_STORES[0]!;
    const pin = container.querySelector<HTMLButtonElement>(`[data-store-id="${first.id}"]`)!;
    fireEvent.click(pin);
    expect(onSelect).toHaveBeenCalledWith(first.id);
    const ja = getWorldCupMarketUiText("ja");
    expect(pin.getAttribute("aria-label")).toContain(ja.selectOnMap);
    if (pin.dataset.approximate === "true") expect(pin.getAttribute("aria-label")).toContain(ja.approximateLocation);
    expect(pin.style.left).toMatch(/%$/);
  });

  it("필터된 점포만 핀으로 그린다", () => {
    const stores = WORLD_CUP_MARKET_STORES.filter((store) => store.category === WORLD_CUP_MARKET_STORES[0]!.category);
    const { container } = render(<WorldCupMarketStaticMap stores={stores} selectedId="" onSelect={vi.fn()} locale="en" />);
    expect(container.querySelectorAll(".worldcup-market-overview-pin")).toHaveLength(stores.length);
  });

  it("상세 모드는 선택 점포를 강조하고 대략 위치 안내를 보여주며 핀 탭으로 점포를 연다", () => {
    const onSelect = vi.fn();
    const { container } = render(<WorldCupMarketStaticMap stores={WORLD_CUP_MARKET_STORES} selectedId="worldcup-market-23" onSelect={onSelect} locale="ko" mode="detail" />);
    expect(container.querySelector('[data-map-mode="detail"]')).toBeTruthy();
    const selected = container.querySelectorAll(".worldcup-market-overview-pin.is-selected");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.getAttribute("data-store-id")).toBe("worldcup-market-23");
    expect(screen.getByText(getWorldCupMarketUiText("ko").mapGuideApproximate)).toBeTruthy();
    fireEvent.click(container.querySelector('[data-store-id="worldcup-market-05"]')!);
    expect(onSelect).toHaveBeenCalledWith("worldcup-market-05");
    // Pins are positioned in image percent so they cannot drift from the image.
    container.querySelectorAll<HTMLElement>(".worldcup-market-overview-pin").forEach((pin) => {
      expect(pin.style.left).toMatch(/%$/);
      expect(pin.style.top).toMatch(/%$/);
    });
    expect(naver.load).not.toHaveBeenCalled();
  });
});
