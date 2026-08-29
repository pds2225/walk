// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Coordinate } from "./types";
import { RoadviewError } from "./roadview";
import type { RoadviewProvider, RoadviewProviderId } from "./roadview";
import {
  createRoadviewProvider,
  GoogleStreetViewAdapter,
  NaverPanoramaAdapter,
  ROADVIEW_PROVIDER_ORDER,
  selectRoadviewProvider,
} from "./roadviewProviders";

const SEOUL: Coordinate = { latitude: 37.5665, longitude: 126.978 };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Roadview provider registry", () => {
  it("keeps Kakao first and reserves the NAVER/Google extension slots", () => {
    expect([...ROADVIEW_PROVIDER_ORDER]).toEqual(["kakao", "naver", "google"]);
    expect(createRoadviewProvider("kakao").id).toBe("kakao");
    expect(createRoadviewProvider("naver")).toBeInstanceOf(NaverPanoramaAdapter);
    expect(createRoadviewProvider("google")).toBeInstanceOf(GoogleStreetViewAdapter);
  });

  it("pins the configured provider for the session instead of re-selecting per open", () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "test");
    const pinned = selectRoadviewProvider();
    expect(pinned.id).toBe("kakao");
    // 매번 새 인스턴스를 만든다 — 그래서 세션을 소유한 화면이 한 번 고른 것을
    // 붙들고 있어야 하고, 뷰어가 열릴 때마다 다시 고르면 안 된다.
    expect(selectRoadviewProvider()).not.toBe(pinned);
    expect(selectRoadviewProvider().id).toBe(pinned.id);
  });

  it("still returns the default provider when no key is configured", () => {
    // 키가 없어도 selection 이 던지지 않는다 — 실패는 뷰어의 fallback 이 처리한다.
    expect(selectRoadviewProvider().id).toBe("kakao");
  });
});

describe("NAVER/Google stubs", () => {
  const stubs: readonly (readonly [RoadviewProviderId, RoadviewProvider])[] = [
    ["naver", new NaverPanoramaAdapter()],
    ["google", new GoogleStreetViewAdapter()],
  ];

  it.each(stubs)("%s reports itself as not configured and never calls a real API", async (id, adapter) => {
    expect(adapter.id).toBe(id);
    expect(adapter.isConfigured()).toBe(false);

    const rejection: unknown = await adapter
      .open(document.createElement("div"), SEOUL, null)
      .then(() => null, (error: unknown) => error);

    expect(rejection).toBeInstanceOf(RoadviewError);
    expect((rejection as RoadviewError).reason).toBe("not_implemented");
  });

  it("never wins provider selection while it is only a stub", () => {
    expect(selectRoadviewProvider().id).not.toBe("naver");
    expect(selectRoadviewProvider().id).not.toBe("google");
  });
});
