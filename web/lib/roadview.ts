import type { Coordinate } from "./types";

/**
 * 기본 설정값 — KN-20260826-05 에서 정한 값 그대로다. 아래 reader 가 환경변수를
 * 읽지 못하면 항상 이 값으로 되돌아간다. 값을 바꾸려면 코드가 아니라 환경변수를
 * 쓴다(`NEXT_PUBLIC_ROADVIEW_TRIGGER_DISTANCE_M`,
 * `NEXT_PUBLIC_ROADVIEW_SEARCH_RADIUS_M`).
 */
export const ROADVIEW_TRIGGER_DISTANCE_M = 50;
export const ROADVIEW_SEARCH_RADII_M: readonly number[] = [50, 30];
export const ROADVIEW_SDK_TIMEOUT_MS = 10_000;
export const ROADVIEW_PANO_TIMEOUT_MS = 5_000;
const KAKAO_SDK_ID = "kakao-maps-sdk-roadview";
const NAVER_SDK_ID = "naver-maps-sdk-roadview";
const GOOGLE_SDK_ID = "google-maps-sdk-streetview";

/**
 * 설정값을 하나로 읽는다. 잘못 적힌 값(음수·문자·빈칸)은 조용히 버리고 기본값을
 * 쓴다 — Roadview 설정 오타가 navigation 자체를 멈추게 하면 안 된다.
 */
function meterList(raw: string | undefined): number[] {
  return (raw ?? "")
    .split(",")
    .map((token) => Number(token.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

/** 목적지까지 남은 거리가 이 값 이하일 때 Roadview 진입을 제안한다(m). */
export function roadviewTriggerDistanceM(): number {
  // Next.js 는 NEXT_PUBLIC_* 를 리터럴 참조에서만 인라인한다 — 동적으로 읽지 않는다.
  return meterList(process.env.NEXT_PUBLIC_ROADVIEW_TRIGGER_DISTANCE_M)[0] ?? ROADVIEW_TRIGGER_DISTANCE_M;
}

/** 목적지 주변 pano 를 찾을 때 순서대로 시도할 반경(m). 예: `"50,30"`. */
export function roadviewSearchRadiiM(): readonly number[] {
  const configured = meterList(process.env.NEXT_PUBLIC_ROADVIEW_SEARCH_RADIUS_M);
  return configured.length > 0 ? configured : ROADVIEW_SEARCH_RADII_M;
}

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

/** Roadview provider. Kakao가 기본이고, NAVER/Google은 키가 있을 때 같은 뷰어에 연결된다. */
export type RoadviewProviderId = "kakao" | "naver" | "google";

/**
 * 열려 있는 Roadview 한 세션.
 *
 * Provider SDK 객체(Kakao `Roadview` 등)를 밖으로 내보내지 않는다 — 공통 뷰어가
 * Kakao 전용 타입에 묶이면 NAVER/Google adapter 를 같은 자리에 끼울 수 없다.
 */
export interface RoadviewSession {
  readonly provider: RoadviewProviderId;
  readonly panoId: string;
  /** 지도 안내로 돌아갈 때 뷰어가 부른다. 실패해도 navigation 은 계속된다. */
  readonly close: () => void;
}

/** K-Navi 공통 뷰어와 Provider SDK 사이의 seam. */
export interface RoadviewProvider {
  readonly id: RoadviewProviderId;
  /** 키·설정만 보고 판단한다(네트워크 호출 없음). 키 값 자체는 반환하지 않는다. */
  readonly isConfigured: () => boolean;
  readonly open: (
    container: HTMLElement,
    destination: Coordinate,
    approachOrigin?: Coordinate | null,
  ) => Promise<RoadviewSession>;
}

export type RoadviewFailure = "missing_key" | "sdk_error" | "no_pano" | "load_error" | "not_implemented";

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

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new RoadviewError("load_error", message)), timeoutMs);
    operation.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
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
  if (existingMaps?.load) {
    return withTimeout(
      new Promise((resolve) => existingMaps.load(() => resolve(existingMaps))),
      ROADVIEW_SDK_TIMEOUT_MS,
      "Kakao Maps SDK 초기화 응답이 지연되었습니다.",
    );
  }
  if (sdkPromise) return sdkPromise;

  const loadOperation = new Promise<KakaoMaps>((resolve, reject) => {
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
  });
  sdkPromise = withTimeout(
    loadOperation,
    ROADVIEW_SDK_TIMEOUT_MS,
    "Kakao Maps SDK 로딩 응답이 지연되었습니다.",
  ).catch((error: unknown) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

function nearestPanoId(client: KakaoRoadviewClient, position: KakaoLatLng, radius: number): Promise<string | null> {
  return withTimeout(
    new Promise((resolve) => {
      client.getNearestPanoId(position, radius, (panoId) => resolve(panoId === null ? null : String(panoId)));
    }),
    ROADVIEW_PANO_TIMEOUT_MS,
    "Kakao Roadview 파노라마 응답이 지연되었습니다.",
  );
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
  for (const radius of roadviewSearchRadiiM()) {
    panoId = await nearestPanoId(client, position, radius);
    if (panoId) break;
  }
  if (!panoId) throw new RoadviewError("no_pano", "목적지 주변에 Roadview가 없습니다.");

  try {
    const view = new maps.Roadview(container);
    view.setPanoId(panoId, position);
    // 진입 시점을 목적지 방향으로 돌려둔다. 사용자의 수동 360° 탐색은 그대로 남는다.
    if (approachOrigin && view.setViewpoint) {
      view.setViewpoint({ pan: bearingDegrees(approachOrigin, destination), tilt: 0, zoom: 0 });
    }
    return {
      provider: "kakao",
      panoId,
      // Kakao Roadview 는 destroy API 를 노출하지 않는다 — container 를 비우는 것이
      // SDK 가 남긴 DOM 을 걷어내는 유일한 방법이다.
      close: () => container.replaceChildren(),
    };
  } catch {
    throw new RoadviewError("load_error", "Roadview 화면을 열지 못했습니다.");
  }
}

export class KakaoRoadviewAdapter implements RoadviewProvider {
  readonly id = "kakao" as const;

  isConfigured(): boolean {
    return kakaoRoadviewConfigured();
  }

  open(container: HTMLElement, destination: Coordinate, approachOrigin?: Coordinate | null): Promise<RoadviewSession> {
    return openKakaoRoadview(container, destination, approachOrigin);
  }
}

interface NaverLatLng {
  readonly lat?: () => number;
  readonly lng?: () => number;
}

interface NaverPanoramaView {
  getPanoId?: () => string | number | null;
  setPov?: (pov: { pan: number; tilt: number; fov?: number }) => void;
  setVisible?: (visible: boolean) => void;
}

interface NaverMaps {
  LatLng: new (latitude: number, longitude: number) => NaverLatLng;
  Panorama: new (
    container: HTMLElement | string,
    options: {
      position?: NaverLatLng;
      pov?: { pan: number; tilt: number; fov?: number };
    },
  ) => NaverPanoramaView;
  Event: {
    addListener: (target: NaverPanoramaView, eventName: string, handler: (status: string) => void) => void;
  };
  onJSContentLoaded?: () => void;
}

interface NaverWindow {
  naver?: { maps?: NaverMaps };
}

interface GoogleLatLngLiteral {
  lat: number;
  lng: number;
}

interface GoogleStreetViewPanoramaData {
  readonly location?: { readonly pano?: string | null };
}

interface GoogleStreetViewResponse {
  readonly data?: GoogleStreetViewPanoramaData;
}

interface GoogleStreetViewPanoramaView {
  setPano?: (panoId: string) => void;
  setPov?: (pov: { heading: number; pitch: number }) => void;
  setVisible?: (visible: boolean) => void;
}

interface GoogleStreetViewService {
  getPanorama: (
    request: { location: GoogleLatLngLiteral; radius: number },
    callback?: (data: GoogleStreetViewPanoramaData | null, status: string) => void,
  ) => Promise<GoogleStreetViewResponse> | void;
}

interface GoogleMaps {
  StreetViewService: new () => GoogleStreetViewService;
  StreetViewPanorama: new (
    container: HTMLElement,
    options?: {
      pano?: string;
      pov?: { heading: number; pitch: number };
      visible?: boolean;
      enableCloseButton?: boolean;
    },
  ) => GoogleStreetViewPanoramaView;
}

interface GoogleWindow {
  google?: { maps?: GoogleMaps };
}

let naverSdkPromise: Promise<NaverMaps> | null = null;
let googleSdkPromise: Promise<GoogleMaps> | null = null;

function naverWindow(): NaverWindow {
  return window as unknown as NaverWindow;
}

function googleWindow(): GoogleWindow {
  return window as unknown as GoogleWindow;
}

function naverClientId(): string {
  return process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim() ?? "";
}

function googleMapsApiKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

export function naverPanoramaConfigured(): boolean {
  return naverClientId().length > 0;
}

export function googleStreetViewConfigured(): boolean {
  return googleMapsApiKey().length > 0;
}

function currentNaverMaps(): NaverMaps | null {
  const maps = naverWindow().naver?.maps;
  return maps?.Panorama && maps.Event ? maps : null;
}

function currentGoogleMaps(): GoogleMaps | null {
  const maps = googleWindow().google?.maps;
  return maps?.StreetViewService && maps.StreetViewPanorama ? maps : null;
}

function closeRoadviewContainer(container: HTMLElement, hide?: () => void): void {
  try {
    hide?.();
  } catch {
    /* SDK 정리 실패가 지도 안내 복귀를 막으면 안 된다. */
  }
  container.replaceChildren();
}

function loadNaverMaps(): Promise<NaverMaps> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new RoadviewError("sdk_error", "Roadview는 브라우저에서만 사용할 수 있습니다."));
  }
  if (!naverClientId()) {
    return Promise.reject(new RoadviewError("missing_key", "NAVER 지도 Client ID가 설정되지 않았습니다."));
  }
  const existing = currentNaverMaps();
  if (existing) return Promise.resolve(existing);
  if (naverSdkPromise) return naverSdkPromise;

  const loadOperation = new Promise<NaverMaps>((resolve, reject) => {
    const finish = () => {
      const maps = currentNaverMaps();
      if (maps) {
        resolve(maps);
        return true;
      }
      return false;
    };
    const waitForPanoramaModule = () => {
      script?.setAttribute("data-loaded", "true");
      if (finish()) return;
      const maps = naverWindow().naver?.maps;
      if (!maps) {
        reject(new RoadviewError("sdk_error", "NAVER Maps SDK를 초기화하지 못했습니다."));
        return;
      }
      maps.onJSContentLoaded = () => {
        if (!finish()) reject(new RoadviewError("sdk_error", "NAVER 파노라마 모듈을 초기화하지 못했습니다."));
      };
    };
    let script = document.getElementById(NAVER_SDK_ID) as HTMLScriptElement | null;
    const onError = () => reject(new RoadviewError("sdk_error", "NAVER Maps SDK를 불러오지 못했습니다."));
    if (!script) {
      script = document.createElement("script");
      script.id = NAVER_SDK_ID;
      script.async = true;
      script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(naverClientId())}&submodules=panorama`;
      script.addEventListener("load", waitForPanoramaModule, { once: true });
      script.addEventListener("error", onError, { once: true });
      document.head.appendChild(script);
    } else if (script.getAttribute("data-loaded") === "true") {
      waitForPanoramaModule();
    } else {
      script.addEventListener("load", waitForPanoramaModule, { once: true });
      script.addEventListener("error", onError, { once: true });
    }
  });
  naverSdkPromise = withTimeout(
    loadOperation,
    ROADVIEW_SDK_TIMEOUT_MS,
    "NAVER Maps SDK 로딩 응답이 지연되었습니다.",
  ).catch((error: unknown) => {
    naverSdkPromise = null;
    throw error;
  });
  return naverSdkPromise;
}

function loadGoogleMaps(): Promise<GoogleMaps> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new RoadviewError("sdk_error", "Roadview는 브라우저에서만 사용할 수 있습니다."));
  }
  if (!googleMapsApiKey()) {
    return Promise.reject(new RoadviewError("missing_key", "Google Maps API 키가 설정되지 않았습니다."));
  }
  const existing = currentGoogleMaps();
  if (existing) return Promise.resolve(existing);
  if (googleSdkPromise) return googleSdkPromise;

  const loadOperation = new Promise<GoogleMaps>((resolve, reject) => {
    const finish = () => {
      const maps = currentGoogleMaps();
      if (!maps) {
        reject(new RoadviewError("sdk_error", "Google Maps SDK를 초기화하지 못했습니다."));
        return;
      }
      resolve(maps);
    };
    let script = document.getElementById(GOOGLE_SDK_ID) as HTMLScriptElement | null;
    const onError = () => reject(new RoadviewError("sdk_error", "Google Maps SDK를 불러오지 못했습니다."));
    if (!script) {
      script = document.createElement("script");
      script.id = GOOGLE_SDK_ID;
      script.async = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsApiKey())}`;
      script.addEventListener("load", finish, { once: true });
      script.addEventListener("error", onError, { once: true });
      document.head.appendChild(script);
    } else {
      script.addEventListener("load", finish, { once: true });
      script.addEventListener("error", onError, { once: true });
    }
  });
  googleSdkPromise = withTimeout(
    loadOperation,
    ROADVIEW_SDK_TIMEOUT_MS,
    "Google Maps SDK 로딩 응답이 지연되었습니다.",
  ).catch((error: unknown) => {
    googleSdkPromise = null;
    throw error;
  });
  return googleSdkPromise;
}

function nearestGooglePanoId(
  service: GoogleStreetViewService,
  location: GoogleLatLngLiteral,
  radius: number,
): Promise<string | null> {
  return withTimeout(
    new Promise<string | null>((resolve) => {
      const fromData = (data: GoogleStreetViewPanoramaData | null | undefined): string | null => {
        const panoId = data?.location?.pano;
        return panoId ? String(panoId) : null;
      };
      const result = service.getPanorama({ location, radius }, (data, status) => {
        if (status === "OK") resolve(fromData(data));
        else resolve(null);
      });
      if (result && typeof result.then === "function") {
        result.then(
          (response) => resolve(fromData(response.data)),
          () => resolve(null),
        );
      }
    }),
    ROADVIEW_PANO_TIMEOUT_MS,
    "Google Street View 파노라마 응답이 지연되었습니다.",
  );
}

export async function openNaverPanorama(
  container: HTMLElement,
  destination: Coordinate,
  approachOrigin?: Coordinate | null,
): Promise<RoadviewSession> {
  let maps: NaverMaps;
  try {
    maps = await loadNaverMaps();
  } catch (error) {
    if (error instanceof RoadviewError) throw error;
    throw new RoadviewError("sdk_error", "NAVER 파노라마를 초기화하지 못했습니다.");
  }

  const position = new maps.LatLng(destination.latitude, destination.longitude);
  const options: {
    position: NaverLatLng;
    pov?: { pan: number; tilt: number; fov: number };
  } = { position };
  if (approachOrigin) {
    options.pov = { pan: bearingDegrees(approachOrigin, destination), tilt: 0, fov: 100 };
  }

  try {
    const view = new maps.Panorama(container, options);
    const session = await withTimeout(
      new Promise<RoadviewSession>((resolve, reject) => {
        maps.Event.addListener(view, "pano_status", (status) => {
          if (status === "OK") {
            if (options.pov && view.setPov) view.setPov(options.pov);
            resolve({
              provider: "naver",
              panoId: String(view.getPanoId?.() ?? "naver"),
              close: () => closeRoadviewContainer(container, () => view.setVisible?.(false)),
            });
            return;
          }
          closeRoadviewContainer(container, () => view.setVisible?.(false));
          reject(new RoadviewError("no_pano", "목적지 주변에 네이버 거리뷰가 없습니다."));
        });
      }),
      ROADVIEW_PANO_TIMEOUT_MS,
      "NAVER 파노라마 응답이 지연되었습니다.",
    );
    return session;
  } catch (error) {
    if (error instanceof RoadviewError) throw error;
    throw new RoadviewError("load_error", "NAVER 거리뷰 화면을 열지 못했습니다.");
  }
}

export async function openGoogleStreetView(
  container: HTMLElement,
  destination: Coordinate,
  approachOrigin?: Coordinate | null,
): Promise<RoadviewSession> {
  let maps: GoogleMaps;
  try {
    maps = await loadGoogleMaps();
  } catch (error) {
    if (error instanceof RoadviewError) throw error;
    throw new RoadviewError("sdk_error", "Google Street View를 초기화하지 못했습니다.");
  }

  const location = { lat: destination.latitude, lng: destination.longitude };
  const service = new maps.StreetViewService();
  let panoId: string | null = null;
  for (const radius of roadviewSearchRadiiM()) {
    panoId = await nearestGooglePanoId(service, location, radius);
    if (panoId) break;
  }
  if (!panoId) throw new RoadviewError("no_pano", "목적지 주변에 Street View가 없습니다.");

  try {
    const heading = approachOrigin ? bearingDegrees(approachOrigin, destination) : 0;
    const view = new maps.StreetViewPanorama(container, {
      pano: panoId,
      pov: { heading, pitch: 0 },
      visible: true,
      enableCloseButton: false,
    });
    view.setPano?.(panoId);
    view.setPov?.({ heading, pitch: 0 });
    return {
      provider: "google",
      panoId,
      close: () => closeRoadviewContainer(container, () => view.setVisible?.(false)),
    };
  } catch {
    throw new RoadviewError("load_error", "Street View 화면을 열지 못했습니다.");
  }
}

export class NaverPanoramaAdapter implements RoadviewProvider {
  readonly id = "naver" as const;

  isConfigured(): boolean {
    return naverPanoramaConfigured();
  }

  open(container: HTMLElement, destination: Coordinate, approachOrigin?: Coordinate | null): Promise<RoadviewSession> {
    return openNaverPanorama(container, destination, approachOrigin);
  }
}

export class GoogleStreetViewAdapter implements RoadviewProvider {
  readonly id = "google" as const;

  isConfigured(): boolean {
    return googleStreetViewConfigured();
  }

  open(container: HTMLElement, destination: Coordinate, approachOrigin?: Coordinate | null): Promise<RoadviewSession> {
    return openGoogleStreetView(container, destination, approachOrigin);
  }
}
