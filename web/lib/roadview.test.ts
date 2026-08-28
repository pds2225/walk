// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Coordinate } from "./types";
import {
  bearingDegrees,
  openKakaoRoadview,
  RoadviewError,
  ROADVIEW_PANO_TIMEOUT_MS,
  ROADVIEW_SEARCH_RADII_M,
  ROADVIEW_SDK_TIMEOUT_MS,
} from "./roadview";

const SEOUL: Coordinate = { latitude: 37.5665, longitude: 126.978 };

afterEach(() => {
  delete (window as unknown as { kakao?: unknown }).kakao;
  vi.unstubAllEnvs();
});

describe("Kakao Roadview adapter", () => {
  it("uses the nearest-pano search radii and opens the real Roadview object", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "test");
    const searchedRadii: number[] = [];
    const view = {
      setPanoId: vi.fn(),
      setViewpoint: vi.fn(),
    };
    class LatLng {
      constructor(readonly latitude: number, readonly longitude: number) {}
    }
    class RoadviewClient {
      getNearestPanoId(_position: unknown, radius: number, callback: (panoId: string) => void) {
        searchedRadii.push(radius);
        callback("pano-123");
      }
    }
    class Roadview {
      constructor(_container: HTMLElement) {}
      setPanoId = view.setPanoId;
      setViewpoint = view.setViewpoint;
    }
    const maps = {
      load: (callback: () => void) => callback(),
      LatLng,
      RoadviewClient,
      Roadview,
    };
    (window as unknown as { kakao: { maps: typeof maps } }).kakao = { maps };

    const result = await openKakaoRoadview(document.createElement("div"), SEOUL, {
      latitude: SEOUL.latitude - 0.001,
      longitude: SEOUL.longitude,
    });

    expect(searchedRadii).toEqual([ROADVIEW_SEARCH_RADII_M[0]]);
    expect(result.panoId).toBe("pano-123");
    expect(view.setPanoId).toHaveBeenCalledWith("pano-123", expect.any(LatLng));
    expect(view.setViewpoint).toHaveBeenCalledWith(expect.objectContaining({ tilt: 0, zoom: 0 }));
  });

  it("tries the fallback radius and returns a non-fatal no-pano error", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "test");
    const searchedRadii: number[] = [];
    class LatLng {}
    class RoadviewClient {
      getNearestPanoId(_position: unknown, radius: number, callback: (panoId: null) => void) {
        searchedRadii.push(radius);
        callback(null);
      }
    }
    class Roadview {}
    const maps = { load: (callback: () => void) => callback(), LatLng, RoadviewClient, Roadview };
    (window as unknown as { kakao: { maps: typeof maps } }).kakao = { maps };

    await expect(openKakaoRoadview(document.createElement("div"), SEOUL)).rejects.toMatchObject({
      reason: "no_pano",
    } satisfies Partial<RoadviewError>);
    expect(searchedRadii).toEqual([...ROADVIEW_SEARCH_RADII_M]);
  });

  it("computes a stable compass bearing for the optional initial viewpoint", () => {
    expect(bearingDegrees(SEOUL, { latitude: SEOUL.latitude + 0.001, longitude: SEOUL.longitude })).toBeCloseTo(0, 0);
    expect(bearingDegrees(SEOUL, { latitude: SEOUL.latitude, longitude: SEOUL.longitude + 0.001 })).toBeCloseTo(90, 0);
  });

  it("fails closed when Kakao SDK initialization never calls its callback", async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "test");
      class LatLng {}
      class RoadviewClient {}
      class Roadview {}
      const maps = {
        load: vi.fn((_callback: () => void) => undefined),
        LatLng,
        RoadviewClient,
        Roadview,
      };
      (window as unknown as { kakao: { maps: typeof maps } }).kakao = { maps };

      const pending = openKakaoRoadview(document.createElement("div"), SEOUL);
      const rejection = expect(pending).rejects.toMatchObject({ reason: "load_error" } satisfies Partial<RoadviewError>);
      await vi.advanceTimersByTimeAsync(ROADVIEW_SDK_TIMEOUT_MS);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed when nearest-pano lookup never calls its callback", async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "test");
      class LatLng {}
      class RoadviewClient {
        getNearestPanoId(_position: unknown, _radius: number, _callback: (panoId: null) => void) {
          // Kakao can leave this callback pending if the SDK/network stalls.
        }
      }
      class Roadview {}
      const maps = {
        load: (callback: () => void) => callback(),
        LatLng,
        RoadviewClient,
        Roadview,
      };
      (window as unknown as { kakao: { maps: typeof maps } }).kakao = { maps };

      const pending = openKakaoRoadview(document.createElement("div"), SEOUL);
      const rejection = expect(pending).rejects.toMatchObject({ reason: "load_error" } satisfies Partial<RoadviewError>);
      await vi.advanceTimersByTimeAsync(ROADVIEW_PANO_TIMEOUT_MS);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
