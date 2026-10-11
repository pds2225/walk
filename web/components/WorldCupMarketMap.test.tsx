// @vitest-environment jsdom
// The SDK is mocked: these checks cover map integration, not live NAVER access.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { localizeCategory, localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import { WORLD_CUP_MARKET_MAP_PLACEMENTS } from "../lib/worldCupMarketMapLayout";
import { WORLD_CUP_MARKET_STORES } from "../lib/worldCupMarketStores";
import WorldCupMarketMap from "./WorldCupMarketMap";

const naver = vi.hoisted(() => ({ configured: vi.fn(() => true), load: vi.fn() }));
vi.mock("../lib/roadview", () => ({
  naverPanoramaConfigured: naver.configured,
  loadNaverMaps: naver.load,
}));

const LOCALES: readonly Locale[] = ["ko", "en", "ja", "zh"];
const firstStore = WORLD_CUP_MARKET_STORES[0]!;

function createSdk() {
  class LatLng {
    constructor(private latitude: number, private longitude: number) {}
    lat() { return this.latitude; }
    lng() { return this.longitude; }
  }
  const projection = vi.fn((position: LatLng) => ({
    x: 190 + (position.lng() - 126.9054) * 70_000,
    y: 310 - (position.lat() - 37.5580) * 100_000,
  }));
  const instance = {
    fitBounds: vi.fn<(points: LatLng[], options: unknown) => void>(),
    getProjection: vi.fn(() => ({ fromCoordToOffset: projection })),
    getSize: vi.fn(() => ({ width: 390, height: 640 })),
    autoResize: vi.fn(),
    destroy: vi.fn(),
  };
  const listeners: Array<{ event: string; handler: () => void }> = [];
  const sdk = {
    LatLng,
    Map: vi.fn(function () { return instance; }),
    Event: {
      addListener: vi.fn((_map: unknown, event: string, handler: () => void) => {
        const listener = { event, handler };
        listeners.push(listener);
        return listener;
      }),
      removeListener: vi.fn(),
    },
  };
  return { sdk, instance, listeners, projection };
}

let provider: ReturnType<typeof createSdk>;
let onResize: ResizeObserverCallback | undefined;
const observe = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  provider = createSdk();
  naver.configured.mockReset().mockReturnValue(true);
  naver.load.mockReset().mockResolvedValue(provider.sdk);
  observe.mockReset();
  disconnect.mockReset();
  onResize = undefined;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { onResize = callback; }
    observe = observe;
    disconnect = disconnect;
    unobserve = vi.fn();
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WorldCupMarketMap", () => {
  it.each(LOCALES)("%s: a missing key leaves all 45 stores selectable in a localized fallback", (locale) => {
    naver.configured.mockReturnValue(false);
    const onSelect = vi.fn();
    render(<WorldCupMarketMap stores={WORLD_CUP_MARKET_STORES} selectedId={firstStore.id} here={null} onSelect={onSelect} locale={locale} />);
    const ui = getWorldCupMarketUiText(locale);
    expect(screen.getByRole("status").textContent).toBe(ui.mapUnavailable);
    const list = screen.getByRole("list", { name: ui.storeList });
    const buttons = within(list).getAllByRole("button");
    expect(buttons).toHaveLength(45);
    for (const [index, store] of WORLD_CUP_MARKET_STORES.entries()) {
      const button = buttons[index]!;
      expect(button.textContent).toContain(localizeStoreName(store, locale));
      expect(button.textContent).toContain(localizeCategory(store.category, locale));
      fireEvent.click(button);
      expect(onSelect).toHaveBeenLastCalledWith(store.id);
    }
    expect(onSelect).toHaveBeenCalledTimes(45);
    expect(naver.load).not.toHaveBeenCalled();
    expect(provider.sdk.Map).not.toHaveBeenCalled();
  });

  it.each(LOCALES)("%s: SDK failure replaces loading with the complete selectable fallback", async (locale) => {
    naver.load.mockRejectedValue(new Error("test SDK unavailable"));
    const onSelect = vi.fn();
    render(<WorldCupMarketMap stores={WORLD_CUP_MARKET_STORES} selectedId={firstStore.id} here={null} onSelect={onSelect} locale={locale} />);
    const ui = getWorldCupMarketUiText(locale);
    expect(screen.getByRole("status").textContent).toBe(ui.mapLoading);
    await screen.findByText(ui.mapUnavailable);
    expect(screen.queryByText(ui.mapLoading)).toBeNull();
    const buttons = within(screen.getByRole("list", { name: ui.storeList })).getAllByRole("button");
    expect(buttons).toHaveLength(45);
    for (const [index, store] of WORLD_CUP_MARKET_STORES.entries()) {
      expect(buttons[index]!.textContent).toContain(localizeStoreName(store, locale));
      fireEvent.click(buttons[index]!);
      expect(onSelect).toHaveBeenLastCalledWith(store.id);
    }
    expect(provider.sdk.Map).not.toHaveBeenCalled();
  });

  it("fits the whole market and renders all 45 distinct selectable numbered pins", async () => {
    const onSelect = vi.fn();
    const view = render(<WorldCupMarketMap stores={WORLD_CUP_MARKET_STORES} selectedId={firstStore.id} here={null} onSelect={onSelect} locale="ko" />);
    await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(45));
    expect(naver.load).toHaveBeenCalledOnce();
    expect(provider.sdk.Map).toHaveBeenCalledOnce();
    expect(provider.instance.fitBounds).toHaveBeenCalledOnce();
    const [bounds] = provider.instance.fitBounds.mock.calls[0]!;
    expect(bounds.map((point: { lat(): number; lng(): number }) => ({ latitude: point.lat(), longitude: point.lng() })))
      .toEqual(WORLD_CUP_MARKET_MAP_PLACEMENTS.map((placement) => placement.displayLocation));
    const positions = new Set<string>();
    for (const store of WORLD_CUP_MARKET_STORES) {
      const pin = view.container.querySelector<HTMLButtonElement>(`button[data-store-id="${store.id}"]`)!;
      expect(pin).toBeTruthy();
      expect(pin.textContent).toBe(String(store.corridorOrder));
      expect(pin.getAttribute("aria-label")).toContain(localizeStoreName(store, "ko"));
      expect(pin.getAttribute("aria-pressed")).toBe(String(store.id === firstStore.id));
      positions.add(`${pin.style.left},${pin.style.top}`);
      fireEvent.click(pin);
      expect(onSelect).toHaveBeenLastCalledWith(store.id);
    }
    expect(positions.size).toBe(45);
    expect(onSelect).toHaveBeenCalledTimes(45);
    expect(view.container.querySelectorAll("line")).toHaveLength(45);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("updates filters, language, selection, location and callbacks without recreating or refitting the SDK map", async () => {
    const onSelect = vi.fn();
    const view = render(<WorldCupMarketMap stores={WORLD_CUP_MARKET_STORES} selectedId={firstStore.id} here={null} onSelect={onSelect} locale="ko" />);
    await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(45));
    const subset = WORLD_CUP_MARKET_STORES.filter((store) => store.category === firstStore.category);
    const selected = subset.at(-1)!;
    const updatedOnSelect = vi.fn();
    const here = { latitude: 37.5580, longitude: 126.9054 };
    for (const locale of ["en", "ja", "zh"] as const) {
      view.rerender(<WorldCupMarketMap stores={subset} selectedId={selected.id} here={here} onSelect={updatedOnSelect} locale={locale} />);
      expect(screen.getAllByRole("button")).toHaveLength(subset.length);
      expect(screen.getByRole("region", { name: getWorldCupMarketUiText(locale).marketMap })).toBeTruthy();
      for (const store of subset) {
        const pin = view.container.querySelector<HTMLButtonElement>(`button[data-store-id="${store.id}"]`)!;
        expect(pin.getAttribute("aria-label")).toContain(localizeStoreName(store, locale));
        expect(pin.getAttribute("aria-label")).toContain(localizeCategory(store.category, locale));
        expect(pin.getAttribute("aria-pressed")).toBe(String(store.id === selected.id));
      }
    }
    const selectedPin = view.container.querySelector<HTMLButtonElement>(`button[data-store-id="${selected.id}"]`)!;
    fireEvent.click(selectedPin);
    expect(updatedOnSelect).toHaveBeenCalledWith(selected.id);
    expect(onSelect).not.toHaveBeenCalled();
    const hereMarker = view.container.querySelector<HTMLElement>(".worldcup-market-here-marker")!;
    expect(hereMarker.style.left).toBe("190px");
    expect(hereMarker.style.top).toBe("310px");
    expect(naver.load).toHaveBeenCalledOnce();
    expect(provider.sdk.Map).toHaveBeenCalledOnce();
    expect(provider.instance.fitBounds).toHaveBeenCalledOnce();
  });

  it("refreshes projected pins on map movement and resize, then disposes listeners, observer and map", async () => {
    const view = render(<WorldCupMarketMap stores={WORLD_CUP_MARKET_STORES} selectedId={firstStore.id} here={null} onSelect={vi.fn()} locale="ko" />);
    await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(45));
    expect(observe).toHaveBeenCalledOnce();
    expect(provider.listeners.map((listener) => listener.event)).toEqual(expect.arrayContaining(["bounds_changed", "idle"]));
    provider.projection.mockReturnValue({ x: 250, y: 400 });
    act(() => { provider.listeners.find((listener) => listener.event === "bounds_changed")!.handler(); });
    expect(view.container.querySelector("line")!.getAttribute("x1")).toBe("250");
    expect(view.container.querySelector("line")!.getAttribute("y1")).toBe("400");
    act(() => { onResize?.([], {} as ResizeObserver); });
    expect(provider.instance.autoResize).toHaveBeenCalledOnce();
    expect(provider.instance.fitBounds).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(provider.instance.destroy).toHaveBeenCalledOnce();
    expect(provider.sdk.Event.removeListener).toHaveBeenCalledTimes(provider.listeners.length);
    for (const listener of provider.listeners) expect(provider.sdk.Event.removeListener).toHaveBeenCalledWith(listener);
    const projectionCalls = provider.instance.getProjection.mock.calls.length;
    act(() => { for (const listener of provider.listeners) listener.handler(); });
    expect(provider.instance.getProjection).toHaveBeenCalledTimes(projectionCalls);
  });

  it("does not create a map when SDK loading finishes after unmount", async () => {
    let resolveSdk: ((sdk: ReturnType<typeof createSdk>["sdk"]) => void) | undefined;
    naver.load.mockImplementation(() => new Promise((resolve) => { resolveSdk = resolve; }));
    const view = render(<WorldCupMarketMap stores={WORLD_CUP_MARKET_STORES} selectedId={firstStore.id} here={null} onSelect={vi.fn()} locale="ko" />);
    expect(screen.getByRole("status").textContent).toBe(getWorldCupMarketUiText("ko").mapLoading);
    view.unmount();
    await act(async () => { resolveSdk?.(provider.sdk); });
    expect(provider.sdk.Map).not.toHaveBeenCalled();
    expect(provider.sdk.Event.addListener).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });
});
