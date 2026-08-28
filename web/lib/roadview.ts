import type { Coordinate } from "./types";

export const ROADVIEW_TRIGGER_DISTANCE_M = 50;
export const ROADVIEW_SEARCH_RADII_M: readonly number[] = [50, 30];
const KAKAO_SDK_ID = "kakao-maps-sdk-roadview";

interface KakaoLatLng {
  readonly getLat?: () => number;
  readonly getLng?: () => number;
}

interface KakaoRoadviewClient {
  getNearestPanoId: (position: KakaoLatLng, radius: number, callback: (panoId: string | number | null) => void) => void;
}

interface KakaoRoadview {
  setPanoId: (panoId: string | number, position: KakaoLatLng) => void;
  setViewpoint?: (viewpoint: { pan: number; tilt: number; zoom: number }) => void;
}

interface KakaoMaps {
  load: (callback: () => void) => void;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  RoadviewClient: new () => KakaoRoadviewClient;
  Roadview: new (container: HTMLElement) => KakaoRoadview;
}

interface KakaoWindow {
  kakao?: { maps?: KakaoMaps };
}

export interface RoadviewSession {
  readonly panoId: string;
  readonly view: KakaoRoadview;
}

/** Provider-neutral seam for future Naver/Google panorama adapters. */
export interface RoadviewProvider {
  open: (
    container: HTMLElement,
    destination: Coordinate,
    approachOrigin?: Coordinate | null,
  ) => Promise<RoadviewSession>;
}

export type RoadviewFailure = "missing_key" | "sdk_error" | "no_pano" | "load_error";

export class RoadviewError extends Error {
  readonly reason: RoadviewFailure;

  constructor(reason: RoadviewFailure, message: string) {
    super(message);
    this.name = "RoadviewError";
    this.reason = reason;
  }
}

let sdkPromise: Promise<KakaoMaps> | null = null;

function kakaoWindow(): KakaoWindow {
  return window as unknown as KakaoWindow;
}

function javascriptKey(): string {
  return process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY?.trim() ?? "";
}

export function kakaoRoadviewConfigured(): boolean {
  return javascriptKey().length > 0;
}

export function bearingDegrees(from: Coordinate, to: Coordinate): number {
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const fromLat = (from.latitude * Math.PI) / 180;
  const toLat = (to.latitude * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function loadKakaoMaps(): Promise<KakaoMaps> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new RoadviewError("sdk_error", "Roadview는 브라우저에서만 사용할 수 있습니다."));
  }
  if (!javascriptKey()) {
    return Promise.reject(new RoadviewError("missing_key", "Kakao Roadview JavaScript 키가 설정되지 않았습니다."));
  }
  const existingMaps = kakaoWindow().kakao?.maps;
  if (existingMaps?.load) return new Promise((resolve) => existingMaps.load(() => resolve(existingMaps)));
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<KakaoMaps>((resolve, reject) => {
    let script = document.getElementById(KAKAO_SDK_ID) as HTMLScriptElement | null;
    const onReady = () => {
      const maps = kakaoWindow().kakao?.maps;
      if (!maps?.load) {
        reject(new RoadviewError("sdk_error", "Kakao Maps SDK를 초기화하지 못했습니다."));
        return;
      }
      maps.load(() => resolve(maps));
    };
    const onError = () => reject(new RoadviewError("sdk_error", "Kakao Maps SDK를 불러오지 못했습니다."));
    if (!script) {
      script = document.createElement("script");
      script.id = KAKAO_SDK_ID;
      script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(javascriptKey())}&autoload=false`;
      script.addEventListener("load", onReady, { once: true });
      script.addEventListener("error", onError, { once: true });
      document.head.appendChild(script);
    } else {
      script.addEventListener("load", onReady, { once: true });
      script.addEventListener("error", onError, { once: true });
    }
  }).catch((error: unknown) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

function nearestPanoId(client: KakaoRoadviewClient, position: KakaoLatLng, radius: number): Promise<string | null> {
  return new Promise((resolve) => {
    client.getNearestPanoId(position, radius, (panoId) => resolve(panoId === null ? null : String(panoId)));
  });
}

export async function openKakaoRoadview(
  container: HTMLElement,
  destination: Coordinate,
  approachOrigin?: Coordinate | null,
): Promise<RoadviewSession> {
  let maps: KakaoMaps;
  try {
    maps = await loadKakaoMaps();
  } catch (error) {
    if (error instanceof RoadviewError) throw error;
    throw new RoadviewError("sdk_error", "Kakao Roadview를 초기화하지 못했습니다.");
  }

  const position = new maps.LatLng(destination.latitude, destination.longitude);
  const client = new maps.RoadviewClient();
  let panoId: string | null = null;
  for (const radius of ROADVIEW_SEARCH_RADII_M) {
    panoId = await nearestPanoId(client, position, radius);
    if (panoId) break;
  }
  if (!panoId) throw new RoadviewError("no_pano", "목적지 주변에 Roadview가 없습니다.");

  try {
    const view = new maps.Roadview(container);
    view.setPanoId(panoId, position);
    if (approachOrigin && view.setViewpoint) {
      view.setViewpoint({ pan: bearingDegrees(approachOrigin, destination), tilt: 0, zoom: 0 });
    }
    return { panoId, view };
  } catch {
    throw new RoadviewError("load_error", "Roadview 화면을 열지 못했습니다.");
  }
}

export class KakaoRoadviewAdapter implements RoadviewProvider {
  open(container: HTMLElement, destination: Coordinate, approachOrigin?: Coordinate | null): Promise<RoadviewSession> {
    return openKakaoRoadview(container, destination, approachOrigin);
  }
}
