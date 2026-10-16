// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const trackMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/track", () => ({ track: trackMock }));

import WorldCupMarketFloorMap from "./WorldCupMarketFloorMap";
import { WORLD_CUP_MARKET_STORES } from "../lib/worldCupMarketStores";

function stubGeo(impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) {
  const getCurrentPosition = vi.fn(impl);
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return getCurrentPosition;
}

afterEach(() => { cleanup(); trackMock.mockClear(); });

describe("WorldCupMarketFloorMap my location", () => {
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
});
