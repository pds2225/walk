// @vitest-environment jsdom
/**
 * getCurrentPositionOnce 는 '걷기'를 누른 순간에만 불리는 1회성 위치 조회다.
 * watchPosition 을 전혀 건드리지 않는다는 것 자체가 계약이므로, 성공/거부/미지원
 * 세 경로 각각이 올바른 Fix/에러를 돌려주는지만 확인한다. 연속 구독(useWatchPosition)
 * 쪽 lifecycle 계약은 web/app/page.test.tsx 에서 실제 컴포넌트를 통해 검증한다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { getCurrentPositionOnce, useSmoothedFix, useWatchPosition, type Fix } from "./useGeolocation";

type SuccessCb = (pos: GeolocationPosition) => void;
type ErrorCb = (err: GeolocationPositionError) => void;

function stubGeolocation(value: Partial<Geolocation> | undefined) {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function watchFix(timestampMs: number): GeolocationPosition {
  return {
    coords: {
      latitude: 37.5,
      longitude: 127.0,
      accuracy: 5,
      heading: null,
      speed: null,
      altitude: null,
      altitudeAccuracy: null,
    },
    timestamp: timestampMs,
  } as GeolocationPosition;
}

describe("getCurrentPositionOnce", () => {
  it("한 번 성공하면 Fix 를 돌려주고, watchPosition 은 건드리지 않는다", async () => {
    const watchPosition = vi.fn();
    stubGeolocation({
      getCurrentPosition: ((success: SuccessCb) => {
        success({
          coords: {
            latitude: 37.5,
            longitude: 127.0,
            accuracy: 5,
            heading: null,
            speed: null,
            altitude: null,
            altitudeAccuracy: null,
          },
          timestamp: 1000,
        } as GeolocationPosition);
      }) as Geolocation["getCurrentPosition"],
      watchPosition,
    });

    const fix = await getCurrentPositionOnce();

    expect(fix.latitude).toBe(37.5);
    expect(fix.longitude).toBe(127.0);
    expect(fix.timestampMs).toBe(1000);
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("권한 거부면 사람이 읽을 수 있는 오류로 reject 한다", async () => {
    stubGeolocation({
      getCurrentPosition: ((_success: SuccessCb, error: ErrorCb) => {
        error({
          code: 1,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: "denied",
        } as GeolocationPositionError);
      }) as Geolocation["getCurrentPosition"],
    });

    await expect(getCurrentPositionOnce()).rejects.toThrow("위치 권한이 꺼져 있습니다");
  });

  it("위치를 못 찾으면(타임아웃 등) 일반 오류 문구로 reject 한다", async () => {
    stubGeolocation({
      getCurrentPosition: ((_success: SuccessCb, error: ErrorCb) => {
        error({
          code: 3,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: "timeout",
        } as GeolocationPositionError);
      }) as Geolocation["getCurrentPosition"],
    });

    await expect(getCurrentPositionOnce()).rejects.toThrow("현재 위치를 찾지 못했습니다");
  });

  it("geolocation 자체가 없으면 즉시 reject 한다", async () => {
    stubGeolocation(undefined);
    await expect(getCurrentPositionOnce()).rejects.toThrow("지원하지 않습니다");
  });
});

describe("useWatchPosition", () => {
  it("stale GPS fix는 최신 fix를 되돌리지 않는다", async () => {
    const callbacks: { success: SuccessCb | null } = { success: null };
    stubGeolocation({
      watchPosition: ((next: SuccessCb) => {
        callbacks.success = next;
        return 7;
      }) as Geolocation["watchPosition"],
      clearWatch: vi.fn(),
    });

    function Probe() {
      const state = useWatchPosition(true);
      return createElement("output", { "data-testid": "timestamp" }, state.fix?.timestampMs ?? "");
    }

    render(createElement(Probe));
    callbacks.success?.(watchFix(2000));
    callbacks.success?.(watchFix(1000));
    await waitFor(() => expect(screen.getByTestId("timestamp").textContent).toBe("2000"));
  });
});

// 전통시장처럼 신호가 반사되는 곳에서 화면 핀이 튀는 문제를 줄이려고 추가한 스무딩.
// 판정용 fix는 건드리지 않으므로 여기서는 useSmoothedFix 자체의 계약만 검증한다.
describe("useSmoothedFix", () => {
  function makeFix(overrides: Partial<Fix>): Fix {
    return {
      latitude: 37.5,
      longitude: 127.0,
      accuracyMeters: 10,
      headingDegrees: null,
      speedMetersPerSecond: null,
      timestampMs: 1000,
      ...overrides,
    };
  }

  function Probe({ fix }: { fix: Fix | null }) {
    const smoothed = useSmoothedFix(fix);
    return createElement("output", { "data-testid": "lat" }, smoothed ? smoothed.latitude.toFixed(8) : "");
  }

  it("첫 fix는 스무딩 없이 그대로 반환한다", async () => {
    const fix = makeFix({});
    render(createElement(Probe, { fix }));
    await waitFor(() => expect(screen.getByTestId("lat").textContent).toBe(fix.latitude.toFixed(8)));
  });

  it("8m 미만 이동이면 정확도가 나쁜 새 fix보다 이전 위치 쪽으로 더 당겨진다", async () => {
    const first = makeFix({ latitude: 37.5, accuracyMeters: 10, timestampMs: 1000 });
    // 위도로 약 3m 이동, 새 fix 정확도(30)가 이전(10)보다 나쁨.
    const second = makeFix({ latitude: 37.500027, accuracyMeters: 30, timestampMs: 2000 });

    let currentFix: Fix = first;
    const Wrapper = () => createElement(Probe, { fix: currentFix });
    const { rerender } = render(createElement(Wrapper));
    await waitFor(() => expect(screen.getByTestId("lat").textContent).toBe(first.latitude.toFixed(8)));

    currentFix = second;
    rerender(createElement(Wrapper));
    await waitFor(() => {
      const shown = Number(screen.getByTestId("lat").textContent);
      expect(shown).toBeGreaterThan(first.latitude);
      expect(shown).toBeLessThan(second.latitude);
    });
  });

  it("8m 이상 한 번에 이동하면 스무딩 없이 새 fix를 그대로 반환한다", async () => {
    const first = makeFix({ latitude: 37.5, accuracyMeters: 5, timestampMs: 1000 });
    // 위도로 약 20m 이동.
    const second = makeFix({ latitude: 37.50018, accuracyMeters: 5, timestampMs: 2000 });

    let currentFix: Fix = first;
    const Wrapper = () => createElement(Probe, { fix: currentFix });
    const { rerender } = render(createElement(Wrapper));
    await waitFor(() => expect(screen.getByTestId("lat").textContent).toBe(first.latitude.toFixed(8)));

    currentFix = second;
    rerender(createElement(Wrapper));
    await waitFor(() => expect(screen.getByTestId("lat").textContent).toBe(second.latitude.toFixed(8)));
  });
});
