// @vitest-environment jsdom
/**
 * 공통 뷰어가 provider 를 통해서만 Roadview 를 다루는지 고정한다 — Kakao 전용
 * 객체나 DOM 을 뷰어가 직접 만지면 NAVER/Google adapter 를 같은 자리에 끼울 수 없다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Coordinate } from "../lib/types";
import { RoadviewError } from "../lib/roadview";
import type { RoadviewProvider, RoadviewSession } from "../lib/roadview";
import RoadviewViewer from "./RoadviewViewer";

const DEST: Coordinate = { latitude: 37.5665, longitude: 126.978 };
const APPROACH: Coordinate = { latitude: 37.5655, longitude: 126.978 };

afterEach(cleanup);

function fakeProvider(session: RoadviewSession, close: () => void): RoadviewProvider {
  return {
    id: "kakao",
    isConfigured: () => true,
    open: vi.fn(() => Promise.resolve({ ...session, close })),
  };
}

describe("RoadviewViewer", () => {
  it("opens through the injected provider and marks the destination", async () => {
    const close = vi.fn();
    const provider = fakeProvider({ provider: "kakao", panoId: "pano-1", close }, close);

    render(
      <RoadviewViewer
        destination={DEST}
        destinationName="경복궁"
        approachOrigin={APPROACH}
        locale="ko"
        provider={provider}
        onClose={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByText(/목적지: 경복궁/)).toBeTruthy());
    expect(provider.open).toHaveBeenCalledTimes(1);
    expect(vi.mocked(provider.open).mock.calls[0]?.[1]).toEqual(DEST);
    expect(vi.mocked(provider.open).mock.calls[0]?.[2]).toEqual(APPROACH);
  });

  it("closes the session through the provider rather than clearing the DOM itself", async () => {
    const close = vi.fn();
    const provider = fakeProvider({ provider: "kakao", panoId: "pano-1", close }, close);

    const view = render(
      <RoadviewViewer
        destination={DEST}
        destinationName="경복궁"
        approachOrigin={null}
        locale="ko"
        provider={provider}
        onClose={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByText(/목적지: 경복궁/)).toBeTruthy());

    view.unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("reuses the pinned provider when the viewer is closed and reopened in one session", async () => {
    const close = vi.fn();
    const provider = fakeProvider({ provider: "kakao", panoId: "pano-1", close }, close);
    const element = (
      <RoadviewViewer
        destination={DEST}
        destinationName="경복궁"
        approachOrigin={null}
        locale="ko"
        provider={provider}
        onClose={() => undefined}
      />
    );

    const first = render(element);
    await waitFor(() => expect(provider.open).toHaveBeenCalledTimes(1));
    first.unmount();
    render(element);
    await waitFor(() => expect(provider.open).toHaveBeenCalledTimes(2));
  });

  it("keeps navigation alive when the provider has no panorama nearby", async () => {
    const provider: RoadviewProvider = {
      id: "kakao",
      isConfigured: () => true,
      open: vi.fn(() => Promise.reject(new RoadviewError("no_pano", "목적지 주변에 Roadview가 없습니다."))),
    };

    render(
      <RoadviewViewer
        destination={DEST}
        destinationName="경복궁"
        approachOrigin={null}
        locale="ko"
        provider={provider}
        onClose={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByText(/목적지 주변에 Roadview가 없습니다/)).toBeTruthy());
    expect(screen.getAllByRole("button", { name: "지도 안내로 돌아가기" }).length).toBeGreaterThan(0);
  });

  it("falls back to a session provider when none is injected", async () => {
    // provider 를 넘기지 않아도 뷰어가 스스로 고른다(키 없음 → 지도 안내 계속).
    render(
      <RoadviewViewer
        destination={DEST}
        destinationName="경복궁"
        approachOrigin={null}
        locale="ko"
        onClose={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByText(/Roadview를 사용할 수 없습니다/)).toBeTruthy());
  });
});
