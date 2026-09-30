// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Coordinate } from "./types";
import {
  bearingDegrees,
  KakaoRoadviewAdapter,
  openGoogleStreetView,
  openKakaoRoadview,
  openNaverPanorama,
  RoadviewError,
  ROADVIEW_PANO_TIMEOUT_MS,
  ROADVIEW_SEARCH_RADII_M,
  ROADVIEW_SDK_TIMEOUT_MS,
  ROADVIEW_TRIGGER_DISTANCE_M,
  roadviewSearchRadiiM,
  roadviewTriggerDistanceM,
} from "./roadview";

const SEOUL: Coordinate = { latitude: 37.5665, longitude: 126.978 };

afterEach(() => {
  delete (window as unknown as { kakao?: unknown }).kakao;
  delete (window as unknown as { naver?: unknown }).naver;
  delete (window as unknown as { google?: unknown }).google;
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
    expect(result.provider).toBe("kakao");
    expect(view.setPanoId).toHaveBeenCalledWith("pano-123", expect.any(LatLng));
    expect(view.setViewpoint).toHaveBeenCalledWith(expect.objectContaining({ tilt: 0, zoom: 0 }));
  });

  it("closes through the session so the viewer never touches provider DOM itself", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "test");
    class LatLng {}
    class RoadviewClient {
      getNearestPanoId(_position: unknown, _radius: number, callback: (panoId: string) => void) {
        callback("pano-123");
      }
    }
    class Roadview {
      constructor(container: HTMLElement) {
        container.appendChild(document.createElement("canvas"));
      }
      setPanoId() {}
    }
    const maps = { load: (callback: () => void) => callback(), LatLng, RoadviewClient, Roadview };
    (window as unknown as { kakao: { maps: typeof maps } }).kakao = { maps };

    const container = document.createElement("div");
    const session = await openKakaoRoadview(container, SEOUL);

    expect(container.childElementCount).toBe(1);
    session.close();
    expect(container.childElementCount).toBe(0);
  });

  it("reports configuration from the existing JavaScript key only", () => {
    const adapter = new KakaoRoadviewAdapter();
    expect(adapter.id).toBe("kakao");
    expect(adapter.isConfigured()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "test");
    expect(adapter.isConfigured()).toBe(true);
  });
});

describe("Roadview configuration", () => {
  it("keeps the shipped defaults when nothing is configured", () => {
    expect(roadviewTriggerDistanceM()).toBe(ROADVIEW_TRIGGER_DISTANCE_M);
    expect(roadviewSearchRadiiM()).toEqual([...ROADVIEW_SEARCH_RADII_M]);
  });

  it("reads the trigger distance and staged search radii from the environment", () => {
    vi.stubEnv("NEXT_PUBLIC_ROADVIEW_TRIGGER_DISTANCE_M", "80");
    vi.stubEnv("NEXT_PUBLIC_ROADVIEW_SEARCH_RADIUS_M", "70, 40 ,20");
    expect(roadviewTriggerDistanceM()).toBe(80);
    expect(roadviewSearchRadiiM()).toEqual([70, 40, 20]);
  });

  it("falls back to the defaults instead of failing on an unusable value", () => {
    vi.stubEnv("NEXT_PUBLIC_ROADVIEW_TRIGGER_DISTANCE_M", "nope");
    vi.stubEnv("NEXT_PUBLIC_ROADVIEW_SEARCH_RADIUS_M", "-5, 0");
    expect(roadviewTriggerDistanceM()).toBe(ROADVIEW_TRIGGER_DISTANCE_M);
    expect(roadviewSearchRadiiM()).toEqual([...ROADVIEW_SEARCH_RADII_M]);
  });

  it("searches the configured radii instead of the hard-coded ones", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "test");
    vi.stubEnv("NEXT_PUBLIC_ROADVIEW_SEARCH_RADIUS_M", "25,15");
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
    expect(searchedRadii).toEqual([25, 15]);
  });
});

describe("Kakao Roadview failure handling", () => {
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

describe("NAVER panorama adapter", () => {
  const APPROACH: Coordinate = { latitude: SEOUL.latitude - 0.001, longitude: SEOUL.longitude };

  function installNaver(status: string, panoId = "n-pano"): { setPov: ReturnType<typeof vi.fn> } {
    const setPov = vi.fn();
    class LatLng {
      constructor(readonly latitude: number, readonly longitude: number) {}
    }
    class Panorama {
      constructor(container: HTMLElement) {
        container.appendChild(document.createElement("canvas"));
      }
      getPanoId = () => panoId;
      setPov = setPov;
      setVisible = vi.fn();
    }
    const maps = {
      LatLng,
      Panorama,
      Event: {
        addListener: (_target: unknown, eventName: string, handler: (value: string) => void) => {
          if (eventName === "pano_status") handler(status);
        },
      },
    };
    (window as unknown as { naver: { maps: typeof maps } }).naver = { maps };
    return { setPov };
  }

  it("opens the panorama and points the camera at the destination", async () => {
    vi.stubEnv("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "ncp-test");
    const { setPov } = installNaver("OK");
    const result = await openNaverPanorama(document.createElement("div"), SEOUL, APPROACH);
    expect(result.provider).toBe("naver");
    expect(result.panoId).toBe("n-pano");
    expect(setPov).toHaveBeenCalledWith(expect.objectContaining({ tilt: 0, fov: 100 }));
  });

  it("closes through the session so leftover SDK DOM is removed", async () => {
    vi.stubEnv("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "ncp-test");
    installNaver("OK");
    const container = document.createElement("div");
    const session = await openNaverPanorama(container, SEOUL);
    expect(container.childElementCount).toBe(1);
    session.close();
    expect(container.childElementCount).toBe(0);
  });

  it("returns a non-fatal no-pano error when the SDK reports ERROR", async () => {
    vi.stubEnv("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "ncp-test");
    installNaver("ERROR");
    await expect(openNaverPanorama(document.createElement("div"), SEOUL)).rejects.toMatchObject({
      reason: "no_pano",
    } satisfies Partial<RoadviewError>);
  });
});

describe("Google Street View adapter", () => {
  const APPROACH: Coordinate = { latitude: SEOUL.latitude - 0.001, longitude: SEOUL.longitude };

  function installGoogle(options: {
    panoByRadius?: Record<number, string | null>;
  } = {}) {
    const searchedRadii: number[] = [];
    const view = {
      setPano: vi.fn(),
      setPov: vi.fn(),
      setVisible: vi.fn(),
    };
    class StreetViewService {
      getPanorama(
        request: { location: { lat: number; lng: number }; radius: number },
        callback?: (data: { location: { pano: string } } | null, status: string) => void,
      ) {
        searchedRadii.push(request.radius);
        const pano = options.panoByRadius && request.radius in options.panoByRadius
          ? options.panoByRadius[request.radius]
          : "g-pano";
        const data = pano ? { location: { pano } } : null;
        const status = pano ? "OK" : "ZERO_RESULTS";
        callback?.(data, status);
      }
    }
    class StreetViewPanorama {
      constructor(container: HTMLElement) {
        container.appendChild(document.createElement("canvas"));
      }
      setPano = view.setPano;
      setPov = view.setPov;
      setVisible = view.setVisible;
    }
    const maps = { StreetViewService, StreetViewPanorama };
    (window as unknown as { google: { maps: typeof maps } }).google = { maps };
    return { searchedRadii, view };
  }

  it("searches configured radii and opens Street View toward the destination", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "gmaps-test");
    const primary = ROADVIEW_SEARCH_RADII_M[0] ?? 50;
    const fallback = ROADVIEW_SEARCH_RADII_M[1] ?? 30;
    const { searchedRadii, view } = installGoogle({
      panoByRadius: { [primary]: null, [fallback]: "g-pano-2" },
    });
    const result = await openGoogleStreetView(document.createElement("div"), SEOUL, APPROACH);
    expect(searchedRadii).toEqual([...ROADVIEW_SEARCH_RADII_M]);
    expect(result.provider).toBe("google");
    expect(result.panoId).toBe("g-pano-2");
    expect(view.setPov).toHaveBeenCalledWith(expect.objectContaining({ pitch: 0 }));
  });

  it("closes through the session so leftover SDK DOM is removed", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "gmaps-test");
    installGoogle();
    const container = document.createElement("div");
    const session = await openGoogleStreetView(container, SEOUL);
    expect(container.childElementCount).toBe(1);
    session.close();
    expect(container.childElementCount).toBe(0);
  });

  it("returns a non-fatal no-pano error when every radius is empty", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "gmaps-test");
    const { searchedRadii } = installGoogle({
      panoByRadius: {
        [ROADVIEW_SEARCH_RADII_M[0] ?? 50]: null,
        [ROADVIEW_SEARCH_RADII_M[1] ?? 30]: null,
      },
    });
    await expect(openGoogleStreetView(document.createElement("div"), SEOUL)).rejects.toMatchObject({
      reason: "no_pano",
    } satisfies Partial<RoadviewError>);
    expect(searchedRadii).toEqual([...ROADVIEW_SEARCH_RADII_M]);
  });
});
