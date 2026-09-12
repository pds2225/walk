/**
 * Roadview provider 목록과 세션 고정.
 *
 * Kakao / NAVER / Google 은 같은 `RoadviewProvider` 계약으로 연결한다. 키가 있는
 * provider 만 선택 대상이고, 하나의 목적지 navigation 세션에서는 provider 를
 * 바꾸지 않는다 — 세션 도중 다시 고르면 같은 목적지가 다른 파노라마로 바뀐다.
 *
 * 기본 순서는 TASK.md 3.3 의 Kakao → NAVER → Google 이다. Kakao 키가 있으면
 * NAVER/Google 은 선택되지 않으므로, 강제 지정은 `NEXT_PUBLIC_ROADVIEW_PROVIDER`
 * 로 한다.
 */
import {
  GoogleStreetViewAdapter,
  KakaoRoadviewAdapter,
  NaverPanoramaAdapter,
} from "./roadview";
import type { RoadviewProvider, RoadviewProviderId } from "./roadview";

export { GoogleStreetViewAdapter, NaverPanoramaAdapter };

/** 선택 우선순위. TASK.md 3.3 의 Kakao → NAVER → Google 순서다. */
export const ROADVIEW_PROVIDER_ORDER: readonly RoadviewProviderId[] = ["kakao", "naver", "google"];

/** 기본 provider — 어떤 provider 도 설정돼 있지 않을 때 돌아갈 자리. */
export const DEFAULT_ROADVIEW_PROVIDER_ID: RoadviewProviderId = "kakao";

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
 * 세션에서 강제로 쓸 provider. 없거나 잘못된 값이면 null.
 * Next.js 는 NEXT_PUBLIC_* 를 리터럴 참조에서만 인라인한다.
 */
export function requestedRoadviewProviderId(): RoadviewProviderId | null {
  const raw = process.env.NEXT_PUBLIC_ROADVIEW_PROVIDER?.trim().toLowerCase();
  if (raw === "kakao" || raw === "naver" || raw === "google") return raw;
  return null;
}

/**
 * navigation 세션이 시작될 때 한 번만 부른다 — 목적지에 가까워질 때마다 다시
 * 부르지 않는다. 설정된 provider 가 하나도 없으면 기본 provider 를 그대로 돌려주고,
 * 실패 처리는 뷰어의 기존 fallback(지도 안내 계속)에 맡긴다.
 *
 * `NEXT_PUBLIC_ROADVIEW_PROVIDER` 가 있고 그 provider 키가 있으면 그것을 우선한다.
 * 지정했는데 키가 없으면 기본 순서로 내려간다.
 */
export function selectRoadviewProvider(): RoadviewProvider {
  const requested = requestedRoadviewProviderId();
  if (requested) {
    const pinned = createRoadviewProvider(requested);
    if (pinned.isConfigured()) return pinned;
  }
  for (const id of ROADVIEW_PROVIDER_ORDER) {
    const provider = createRoadviewProvider(id);
    if (provider.isConfigured()) return provider;
  }
  return createRoadviewProvider(DEFAULT_ROADVIEW_PROVIDER_ID);
}
