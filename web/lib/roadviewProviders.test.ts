// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Coordinate } from "./types";
import { RoadviewError } from "./roadview";
import {
  createRoadviewProvider,
  GoogleStreetViewAdapter,
  NaverPanoramaAdapter,
  requestedRoadviewProviderId,
  ROADVIEW_PROVIDER_ORDER,
  selectRoadviewProvider,
} from "./roadviewProviders";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Roadview provider registry", () => {
  it("keeps Kakao first and uses the NAVER/Google adapter classes", () => {
    expect([...ROADVIEW_PROVIDER_ORDER]).toEqual(["kakao", "naver", "google"]);
    expect(createRoadviewProvider("kakao").id).toBe("kakao");
    expect(createRoadviewProvider("naver")).toBeInstanceOf(NaverPanoramaAdapter);
    expect(createRoadviewProvider("google")).toBeInstanceOf(GoogleStreetViewAdapter);
  });

  it("pins the configured provider for the session instead of re-selecting per open", () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "test");
    const pinned = selectRoadviewProvider();
    expect(pinned.id).toBe("kakao");
    expect(selectRoadviewProvider()).not.toBe(pinned);
    expect(selectRoadviewProvider().id).toBe(pinned.id);
  });

  it("still returns the default provider when no key is configured", () => {
    expect(selectRoadviewProvider().id).toBe("kakao");
  });

  it("selects NAVER when only the NAVER map client id is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "ncp-test");
    expect(selectRoadviewProvider().id).toBe("naver");
  });

  it("selects Google when only the Google Maps key is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "gmaps-test");
    expect(selectRoadviewProvider().id).toBe("google");
  });

  it("keeps Kakao when Kakao and NAVER are both configured", () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "kakao-test");
    vi.stubEnv("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "ncp-test");
    expect(selectRoadviewProvider().id).toBe("kakao");
  });

  it("honors NEXT_PUBLIC_ROADVIEW_PROVIDER when that provider has a key", () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "kakao-test");
    vi.stubEnv("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "ncp-test");
    vi.stubEnv("NEXT_PUBLIC_ROADVIEW_PROVIDER", "naver");
    expect(requestedRoadviewProviderId()).toBe("naver");
    expect(selectRoadviewProvider().id).toBe("naver");
  });

  it("ignores an unusable provider pin and falls back to the configured order", () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "kakao-test");
    vi.stubEnv("NEXT_PUBLIC_ROADVIEW_PROVIDER", "naver");
    expect(selectRoadviewProvider().id).toBe("kakao");
  });

  it("ignores an invalid provider pin", () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "kakao-test");
    vi.stubEnv("NEXT_PUBLIC_ROADVIEW_PROVIDER", "tmap");
    expect(requestedRoadviewProviderId()).toBeNull();
    expect(selectRoadviewProvider().id).toBe("kakao");
  });
});

describe("NAVER/Google configuration", () => {
  it("reports NAVER as unconfigured without a map client id and fails closed on missing_key", async () => {
    const adapter = new NaverPanoramaAdapter();
    expect(adapter.isConfigured()).toBe(false);
    const rejection: unknown = await adapter
      .open(document.createElement("div"), { latitude: 37.5665, longitude: 126.978 }, null)
      .then(() => null, (error: unknown) => error);
    expect(rejection).toBeInstanceOf(RoadviewError);
    expect((rejection as RoadviewError).reason).toBe("missing_key");
  });

  it("reports Google as unconfigured without an API key and fails closed on missing_key", async () => {
    const adapter = new GoogleStreetViewAdapter();
    expect(adapter.isConfigured()).toBe(false);
    const rejection: unknown = await adapter
      .open(document.createElement("div"), { latitude: 37.5665, longitude: 126.978 }, null)
      .then(() => null, (error: unknown) => error);
    expect(rejection).toBeInstanceOf(RoadviewError);
    expect((rejection as RoadviewError).reason).toBe("missing_key");
  });
});
