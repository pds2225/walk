// @vitest-environment jsdom
/**
 * getCurrentPositionOnce 는 '걷기'를 누른 순간에만 불리는 1회성 위치 조회다.
 * watchPosition 을 전혀 건드리지 않는다는 것 자체가 계약이므로, 성공/거부/미지원
 * 세 경로 각각이 올바른 Fix/에러를 돌려주는지만 확인한다. 연속 구독(useWatchPosition)
 * 쪽 lifecycle 계약은 web/app/page.test.tsx 에서 실제 컴포넌트를 통해 검증한다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentPositionOnce } from "./useGeolocation";

type SuccessCb = (pos: GeolocationPosition) => void;
type ErrorCb = (err: GeolocationPositionError) => void;

function stubGeolocation(value: Partial<Geolocation> | undefined) {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

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
