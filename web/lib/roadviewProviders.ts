/**
 * Roadview provider 목록과 세션 고정.
 *
 * 지금 실제로 연결된 provider 는 Kakao 하나뿐이다(KN-20260826-05). NAVER/Google 은
 * 확장 자리만 잡아둔 stub 이며 실제 API 를 부르지 않는다 — 부르는 척하다 조용히
 * 빈 화면을 띄우는 것보다, 연결되지 않았다고 분명히 실패하는 편이 안전하다.
 *
 * 하나의 목적지 navigation 세션에서는 provider 를 바꾸지 않는다. 세션 도중 다시
 * 고르면 같은 목적지가 중간에 다른 파노라마로 바뀌어 사용자가 목적지를 다시
 * 식별해야 한다.
 */
import { KakaoRoadviewAdapter, RoadviewError } from "./roadview";
import type { RoadviewProvider, RoadviewProviderId, RoadviewSession } from "./roadview";

/** 선택 우선순위. TASK.md 3.3 의 Kakao → NAVER → Google 순서다. */
export const ROADVIEW_PROVIDER_ORDER: readonly RoadviewProviderId[] = ["kakao", "naver", "google"];

/** 기본 provider — 어떤 provider 도 설정돼 있지 않을 때 돌아갈 자리. */
export const DEFAULT_ROADVIEW_PROVIDER_ID: RoadviewProviderId = "kakao";

/** NAVER 파노라마 확장 자리. 실제 API 연결은 이 TASK 범위가 아니다. */
export class NaverPanoramaAdapter implements RoadviewProvider {
  readonly id = "naver" as const;

  isConfigured(): boolean {
    return false;
  }

  open(): Promise<RoadviewSession> {
    return Promise.reject(new RoadviewError("not_implemented", "NAVER 파노라마는 아직 연결되지 않았습니다."));
  }
}

/** Google Street View 확장 자리. 실제 API 연결은 이 TASK 범위가 아니다. */
export class GoogleStreetViewAdapter implements RoadviewProvider {
  readonly id = "google" as const;

  isConfigured(): boolean {
    return false;
  }

  open(): Promise<RoadviewSession> {
    return Promise.reject(new RoadviewError("not_implemented", "Google Street View는 아직 연결되지 않았습니다."));
  }
}

export function createRoadviewProvider(id: RoadviewProviderId): RoadviewProvider {
  switch (id) {
    case "naver":
      return new NaverPanoramaAdapter();
    case "google":
      return new GoogleStreetViewAdapter();
    case "kakao":
      return new KakaoRoadviewAdapter();
  }
}

/**
 * navigation 세션이 시작될 때 한 번만 부른다 — 목적지에 가까워질 때마다 다시
 * 부르지 않는다. 설정된 provider 가 하나도 없으면 기본 provider 를 그대로 돌려주고,
 * 실패 처리는 뷰어의 기존 fallback(지도 안내 계속)에 맡긴다.
 */
export function selectRoadviewProvider(): RoadviewProvider {
  for (const id of ROADVIEW_PROVIDER_ORDER) {
    const provider = createRoadviewProvider(id);
    if (provider.isConfigured()) return provider;
  }
  return createRoadviewProvider(DEFAULT_ROADVIEW_PROVIDER_ID);
}
