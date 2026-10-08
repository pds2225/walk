// @vitest-environment jsdom
// Verify panorama selection and truthful location availability messages.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import type { RoadviewSession } from "../lib/roadview";
import { localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import { WORLD_CUP_MARKET_STORES, type WorldCupMarketStore } from "../lib/worldCupMarketStores";
import WorldCupMarketStreetView from "./WorldCupMarketStreetView";

const naver = vi.hoisted(() => ({ configured: vi.fn(() => true), open: vi.fn() }));
vi.mock("../lib/roadview", () => ({
  NaverPanoramaAdapter: class {
    isConfigured = naver.configured;
    open = naver.open;
  },
}));

const LOCALES: readonly Locale[] = ["ko", "en", "ja", "zh"];
const baseStore = WORLD_CUP_MARKET_STORES[0];
if (!baseStore) throw new Error("점포가 없습니다");
const unlocated: WorldCupMarketStore = {
  ...baseStore,
  storeLocation: null,
  navigationTarget: null,
  streetViewLocation: null,
  streetView: { ...baseStore.streetView, provider: "GOOGLE", available: false, lastResolvedPanoId: null },
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED", "true");
  naver.configured.mockReset().mockReturnValue(true);
  naver.open.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function withCoordinate(store: WorldCupMarketStore): WorldCupMarketStore {
  const sourceUrl = store.officialSource;
  if (!sourceUrl) throw new Error("점포 fixture의 블로그 출처가 없습니다");
  const location = {
    latitude: 37.5579,
    longitude: 126.9054,
    source: "component test fixture",
    coordSource: "component test fixture",
    evidenceAddress: store.address,
    sourceUrl,
    geocodedAddress: store.address,
    verifiedAt: "2026-10-04",
    verificationStatus: "UNKNOWN" as const,
  };
  return {
    ...store,
    storeLocation: location,
    navigationTarget: location,
  };
}

function withNaverPanorama(): WorldCupMarketStore {
  const located = withCoordinate(unlocated);
  return {
    ...located,
    streetViewLocation: { latitude: 37.5581, longitude: 126.9057 },
    streetView: { ...located.streetView, provider: "NAVER", available: true, lastResolvedPanoId: "pano-test" },
  };
}

describe("WorldCupMarketStreetView", () => {
  it.each(LOCALES)("%s: 도보 기능 기본 숨김일 때 거리뷰 fallback은 지도 위치만 안내한다", (locale) => {
    vi.stubEnv("NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED", "");
    const ui = getWorldCupMarketUiText(locale);
    const view = render(<WorldCupMarketStreetView store={withCoordinate(unlocated)} locale={locale} />);
    expect(screen.getByText(ui.storefrontMapFallback)).toBeTruthy();
    expect(screen.queryByText(ui.storefrontFallback)).toBeNull();
    view.rerender(<WorldCupMarketStreetView store={unlocated} locale={locale} />);
    expect(screen.getByText(ui.storefrontLocationUnknown)).toBeTruthy();
    expect(screen.queryByText(ui.storefrontWalkingOnlyFallback)).toBeNull();
  });

  it("JA 선택 시 이미 열린 NAVER 파노라마의 UI가 재생성 없이 일본어로 바뀐다", async () => {
    naver.open.mockResolvedValue({ provider: "naver", panoId: "pano-new", close: vi.fn() });
    const store = withNaverPanorama();
    const view = render(<WorldCupMarketStreetView store={store} locale="ko" />);
    await screen.findByText(getWorldCupMarketUiText("ko").panoramaUpdatedNotice);
    for (const locale of ["ja", "en", "zh"] as const) {
      view.rerender(<WorldCupMarketStreetView store={store} locale={locale} />);
      expect(screen.getByText(getWorldCupMarketUiText(locale).panoramaUpdatedNotice)).toBeTruthy();
      expect(screen.getByRole("img").getAttribute("aria-label")).toContain(getWorldCupMarketUiText(locale).storefrontTitle);
    }
    expect(naver.open).toHaveBeenCalledOnce();
  });

  it.each(LOCALES)("%s: 좌표가 없는 점포는 키가 있어도 지도·도보 가능을 주장하지 않는다", (locale) => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const ui = getWorldCupMarketUiText(locale);
    render(<WorldCupMarketStreetView store={unlocated} locale={locale} />);
    expect(screen.getByText(ui.storefrontUnavailable)).toBeTruthy();
    expect(screen.getByText(ui.storefrontUnknownFallback)).toBeTruthy();
    expect(screen.queryByText(ui.storefrontFallback)).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("좌표가 있지만 파노가 없으면 지도와 도보 안내를 사용 가능으로 표시한다", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    render(<WorldCupMarketStreetView store={withCoordinate(unlocated)} locale="ko" />);
    expect(screen.getByText(getWorldCupMarketUiText("ko").storefrontFallback)).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("지도 좌표만 있으면 도보 안내를 사용 가능으로 표시하지 않는다", () => {
    const located = { ...withCoordinate(unlocated), navigationTarget: null };
    render(<WorldCupMarketStreetView store={located} locale="ko" />);
    expect(screen.getByText(getWorldCupMarketUiText("ko").storefrontMapOnlyFallback)).toBeTruthy();
    expect(screen.queryByText(getWorldCupMarketUiText("ko").storefrontFallback)).toBeNull();
  });

  it("도보 목적지만 있으면 지도를 사용 가능으로 표시하지 않는다", () => {
    const located = { ...withCoordinate(unlocated), storeLocation: null };
    render(<WorldCupMarketStreetView store={located} locale="ko" />);
    expect(screen.getByText(getWorldCupMarketUiText("ko").storefrontWalkingOnlyFallback)).toBeTruthy();
  });

  it("파노가 확인되어도 로컬 키가 없으면 iframe을 만들지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    const located = withCoordinate(unlocated);
    const store = { ...located, streetView: { ...located.streetView, available: true, lastResolvedPanoId: "pano-test" } };
    render(<WorldCupMarketStreetView store={store} locale="ko" />);
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByText(getWorldCupMarketUiText("ko").storefrontFallback)).toBeTruthy();
  });

  it("메타데이터 파노 위치를 우선 사용하고 네 언어에서 점포 근처 거리뷰로 안내한다", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const located = withCoordinate(unlocated);
    const store = {
      ...located,
      streetViewLocation: { latitude: 37.5581, longitude: 126.9057 },
      streetView: { ...located.streetView, available: true, lastResolvedPanoId: "pano-test" },
    };
    for (const locale of LOCALES) {
      const ui = getWorldCupMarketUiText(locale);
      const view = render(<WorldCupMarketStreetView store={store} locale={locale} />);
      expect(screen.getByText(ui.storeStreetViewDescription)).toBeTruthy();
      const frame = screen.getByTitle(`${localizeStoreName(store, locale)} ${ui.storefrontTitle}`);
      expect(frame.getAttribute("src")).toContain("pano=pano-test");
      expect(frame.getAttribute("src")).toContain("location=37.5581%2C126.9057");
      expect(frame.getAttribute("src")).not.toContain("location=37.5579%2C126.9054");
      view.unmount();
    }
  });

  it("NAVER는 Google 키 없이 기존 어댑터로 기록된 파노 좌표의 근처 영상을 연다", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    const store = withNaverPanorama();
    naver.open.mockImplementation((host: HTMLElement) => {
      host.appendChild(document.createElement("canvas"));
      return Promise.resolve({ provider: "naver", panoId: "pano-test", close: vi.fn() });
    });
    render(<WorldCupMarketStreetView store={store} locale="ko" />);
    expect(screen.getByText(getWorldCupMarketUiText("ko").panoramaLoading)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(getWorldCupMarketUiText("ko").panoramaLoading)).toBeNull());
    expect(naver.open).toHaveBeenCalledWith(expect.any(HTMLElement), store.streetViewLocation);
    expect(screen.getByRole("img", { name: /NAVER Panorama/ }).querySelector("canvas")).toBeTruthy();
    expect(screen.getByText(`NAVER Panorama · ${getWorldCupMarketUiText("ko").storeStreetViewDescription}`)).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("NAVER 키가 없으면 좌표가 있는 점포의 지도·도보 fallback을 유지한다", () => {
    naver.configured.mockReturnValue(false);
    render(<WorldCupMarketStreetView store={withNaverPanorama()} locale="ko" />);
    expect(screen.getByText(getWorldCupMarketUiText("ko").storefrontFallback)).toBeTruthy();
    expect(naver.open).not.toHaveBeenCalled();
  });

  it("NAVER 메타데이터 좌표가 없으면 점포 주소 좌표로 파노를 추측해서 열지 않는다", () => {
    const store = { ...withNaverPanorama(), streetViewLocation: null };
    render(<WorldCupMarketStreetView store={store} locale="ko" />);
    expect(screen.getByText(getWorldCupMarketUiText("ko").storefrontFallback)).toBeTruthy();
    expect(naver.open).not.toHaveBeenCalled();
  });

  it("NAVER 네트워크·파노 실패 후 화면을 비우고 정확한 가용 상태로 돌아간다", async () => {
    naver.open.mockImplementation((host: HTMLElement) => {
      host.appendChild(document.createElement("canvas"));
      return Promise.reject(new Error("test provider failure"));
    });
    const store = { ...withNaverPanorama(), navigationTarget: null };
    render(<WorldCupMarketStreetView store={store} locale="ko" />);
    expect(await screen.findByText(getWorldCupMarketUiText("ko").storefrontMapOnlyFallback)).toBeTruthy();
    expect(document.querySelector("canvas")).toBeNull();
    expect(screen.queryByText(getWorldCupMarketUiText("ko").storefrontFallback)).toBeNull();
  });

  it("NAVER 실제 파노 ID가 달라도 확인된 정면으로 주장하지 않고 변경을 안내한다", async () => {
    naver.open.mockResolvedValue({ provider: "naver", panoId: "pano-new", close: vi.fn() });
    render(<WorldCupMarketStreetView store={withNaverPanorama()} locale="ko" />);
    expect(await screen.findByText(getWorldCupMarketUiText("ko").panoramaUpdatedNotice)).toBeTruthy();
    expect(screen.getByText(`NAVER Panorama · ${getWorldCupMarketUiText("ko").storeStreetViewDescription}`)).toBeTruthy();
  });

  it("NAVER 첫 점포 로딩이 실패해도 다음 점포의 파노를 다시 열 수 있다", async () => {
    naver.open.mockRejectedValueOnce(new Error("test first panorama failure"));
    naver.open.mockResolvedValueOnce({ provider: "naver", panoId: "pano-test", close: vi.fn() });
    const first = withNaverPanorama();
    const second = {
      ...withNaverPanorama(),
      id: "component-recovery-store",
      streetViewLocation: { latitude: 37.5582, longitude: 126.9058 },
    };
    const view = render(<WorldCupMarketStreetView store={first} locale="ko" />);
    expect(await screen.findByText(getWorldCupMarketUiText("ko").storefrontFallback)).toBeTruthy();
    view.rerender(<WorldCupMarketStreetView store={second} locale="ko" />);
    expect(await screen.findByText(`NAVER Panorama · ${getWorldCupMarketUiText("ko").storeStreetViewDescription}`)).toBeTruthy();
    expect(naver.open).toHaveBeenCalledTimes(2);
    expect(naver.open).toHaveBeenLastCalledWith(expect.any(HTMLElement), second.streetViewLocation);
    expect(screen.queryByText(getWorldCupMarketUiText("ko").storefrontFallback)).toBeNull();
  });

  it("NAVER ready 세션은 화면을 떠날 때 닫는다", async () => {
    const close = vi.fn();
    naver.open.mockResolvedValue({ provider: "naver", panoId: "pano-test", close });
    const view = render(<WorldCupMarketStreetView store={withNaverPanorama()} locale="ko" />);
    await waitFor(() => expect(screen.queryByText(getWorldCupMarketUiText("ko").panoramaLoading)).toBeNull());
    view.unmount();
    expect(close).toHaveBeenCalledOnce();
  });

  it("NAVER 비동기 로딩 중 떠난 화면은 늦게 열린 세션도 닫는다", async () => {
    let resolveSession: ((session: RoadviewSession) => void) | undefined;
    naver.open.mockImplementation(() => new Promise<RoadviewSession>((resolve) => { resolveSession = resolve; }));
    const close = vi.fn();
    const view = render(<WorldCupMarketStreetView store={withNaverPanorama()} locale="ko" />);
    view.unmount();
    await act(async () => { resolveSession?.({ provider: "naver", panoId: "pano-test", close }); });
    expect(close).toHaveBeenCalledOnce();
  });
});
