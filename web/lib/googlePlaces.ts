import { distanceMeters } from "@walk/route-engine";
import type { Coordinate, PlaceHit } from "./types";

const GOOGLE_SDK_ID = "google-maps-sdk-streetview";
const GOOGLE_MAPS_JS_URL = "https://maps.googleapis.com/maps/api/js";
const GOOGLE_SDK_TIMEOUT_MS = 10_000;
const DEFAULT_RADIUS_M = 1_500;
const MAX_RADIUS_M = 50_000;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

const PLACE_FIELDS = [
  "id",
  "displayName",
  "location",
  "formattedAddress",
  "googleMapsURI",
  "rating",
  "userRatingCount",
  "primaryType",
] as const;

export type GooglePlacesFailure = "missing_key" | "sdk_error" | "search_error";

export class GooglePlacesError extends Error {
  readonly reason: GooglePlacesFailure;

  constructor(reason: GooglePlacesFailure, message: string) {
    super(message);
    this.name = "GooglePlacesError";
    this.reason = reason;
  }
}

export interface NearbyPlaceHit extends PlaceHit {
  readonly placeId?: string;
  readonly address?: string;
  readonly googleMapsUrl?: string;
  readonly rating?: number;
  readonly reviewCount?: number;
  readonly primaryType?: string;
}

export interface NearbySearchOptions {
  /** Search radius in meters. Google Nearby Search supports up to 50 km. */
  readonly radiusMeters?: number;
  /** Number of candidates to return. */
  readonly limit?: number;
  /** Google Places primary types, e.g. restaurant, cafe, bar. */
  readonly includedPrimaryTypes?: readonly string[];
}

interface GoogleLatLngLike {
  readonly lat: number | (() => number);
  readonly lng: number | (() => number);
}

interface GooglePlaceLike {
  readonly id?: string | null;
  readonly displayName?: string | null;
  readonly location?: GoogleLatLngLike | null;
  readonly formattedAddress?: string | null;
  readonly googleMapsURI?: string | null;
  readonly rating?: number | null;
  readonly userRatingCount?: number | null;
  readonly primaryType?: string | null;
}

interface SearchNearbyRequest {
  readonly fields: readonly string[];
  readonly locationRestriction: {
    readonly center: { readonly lat: number; readonly lng: number };
    readonly radius: number;
  };
  readonly includedPrimaryTypes?: readonly string[];
  readonly maxResultCount: number;
  readonly rankPreference: unknown;
}

interface SearchNearbyResponse {
  readonly places?: readonly GooglePlaceLike[];
}

interface GooglePlaceStatic {
  searchNearby: (request: SearchNearbyRequest) => Promise<SearchNearbyResponse>;
}

interface PlacesLibrary {
  readonly Place: GooglePlaceStatic;
  readonly SearchNearbyRankPreference: {
    readonly DISTANCE: unknown;
  };
}

interface GoogleMaps {
  readonly importLibrary?: (libraryName: string) => Promise<unknown>;
}

interface GoogleWindow {
  google?: { maps?: GoogleMaps };
}

let googleSdkPromise: Promise<GoogleMaps> | null = null;

function googleWindow(): GoogleWindow {
  return window as unknown as GoogleWindow;
}

function googleMapsApiKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

export function googleNearbyConfigured(): boolean {
  return googleMapsApiKey().length > 0;
}

function currentGoogleMaps(): GoogleMaps | null {
  const maps = googleWindow().google?.maps;
  return maps?.importLibrary ? maps : null;
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new GooglePlacesError("sdk_error", message)), timeoutMs);
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

function loadGoogleMaps(): Promise<GoogleMaps> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new GooglePlacesError("sdk_error", "Google Places는 브라우저에서만 사용할 수 있습니다."));
  }
  if (!googleMapsApiKey()) {
    return Promise.reject(new GooglePlacesError("missing_key", "Google Maps API 키가 설정되지 않았습니다."));
  }

  const existing = currentGoogleMaps();
  if (existing) return Promise.resolve(existing);
  if (googleSdkPromise) return googleSdkPromise;

  const loadOperation = new Promise<GoogleMaps>((resolve, reject) => {
    const finish = () => {
      const maps = currentGoogleMaps();
      if (!maps) {
        reject(new GooglePlacesError("sdk_error", "Google Maps SDK를 초기화하지 못했습니다."));
        return;
      }
      resolve(maps);
    };
    const onError = () => reject(new GooglePlacesError("sdk_error", "Google Maps SDK를 불러오지 못했습니다."));

    let script = document.getElementById(GOOGLE_SDK_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = GOOGLE_SDK_ID;
      script.async = true;
      script.src = `${GOOGLE_MAPS_JS_URL}?key=${encodeURIComponent(googleMapsApiKey())}&v=weekly`;
      script.addEventListener("load", finish, { once: true });
      script.addEventListener("error", onError, { once: true });
      document.head.appendChild(script);
    } else {
      // Street View가 먼저 같은 SDK를 로딩 중이면 그 script를 그대로 기다린다.
      const now = currentGoogleMaps();
      if (now) {
        resolve(now);
        return;
      }
      script.addEventListener("load", finish, { once: true });
      script.addEventListener("error", onError, { once: true });
    }
  });

  googleSdkPromise = withTimeout(
    loadOperation,
    GOOGLE_SDK_TIMEOUT_MS,
    "Google Maps SDK 로딩 응답이 지연되었습니다.",
  ).catch((error: unknown) => {
    googleSdkPromise = null;
    throw error;
  });
  return googleSdkPromise;
}

async function loadPlacesLibrary(): Promise<PlacesLibrary> {
  const maps = await loadGoogleMaps();
  if (!maps.importLibrary) {
    throw new GooglePlacesError("sdk_error", "Google Maps Places 라이브러리를 불러올 수 없습니다.");
  }

  let raw: unknown;
  try {
    raw = await maps.importLibrary("places");
  } catch {
    throw new GooglePlacesError("sdk_error", "Google Places 라이브러리를 불러오지 못했습니다.");
  }

  const library = raw as Partial<PlacesLibrary>;
  if (
    !library.Place ||
    typeof library.Place.searchNearby !== "function" ||
    !library.SearchNearbyRankPreference
  ) {
    throw new GooglePlacesError("sdk_error", "Google Places Nearby Search를 초기화하지 못했습니다.");
  }
  return library as PlacesLibrary;
}

function finitePositive(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, max);
}

function normalizedLimit(value: number | undefined): number {
  return Math.max(1, Math.floor(finitePositive(value, DEFAULT_LIMIT, MAX_LIMIT)));
}

function normalizedTypes(types: readonly string[] | undefined): string[] {
  const cleaned = (types ?? ["restaurant"])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : ["restaurant"];
}

function coordinateFromLocation(location: GoogleLatLngLike | null | undefined): Coordinate | null {
  if (!location) return null;
  const latitude = typeof location.lat === "function" ? location.lat() : location.lat;
  const longitude = typeof location.lng === "function" ? location.lng() : location.lng;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function optionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Current-position nearby search for the future travel hub.
 *
 * It deliberately does not read the user's Google Maps Saved lists. Google Maps
 * does not expose those private Saved lists through Places Nearby Search. Saved
 * candidates should be stored in the travel data and merged ahead of these
 * fallback results by the UI.
 */
export async function searchNearbyGooglePlaces(
  center: Coordinate,
  options: NearbySearchOptions = {},
): Promise<NearbyPlaceHit[]> {
  const radius = finitePositive(options.radiusMeters, DEFAULT_RADIUS_M, MAX_RADIUS_M);
  const limit = normalizedLimit(options.limit);
  const includedPrimaryTypes = normalizedTypes(options.includedPrimaryTypes);
  const { Place, SearchNearbyRankPreference } = await loadPlacesLibrary();

  let response: SearchNearbyResponse;
  try {
    response = await Place.searchNearby({
      fields: PLACE_FIELDS,
      locationRestriction: {
        center: { lat: center.latitude, lng: center.longitude },
        radius,
      },
      includedPrimaryTypes,
      maxResultCount: limit,
      rankPreference: SearchNearbyRankPreference.DISTANCE,
    });
  } catch (error) {
    if (error instanceof GooglePlacesError) throw error;
    throw new GooglePlacesError("search_error", "주변 장소 검색에 실패했습니다.");
  }

  const hits: NearbyPlaceHit[] = [];
  for (const place of response.places ?? []) {
    const coordinate = coordinateFromLocation(place.location);
    if (!coordinate) continue;

    const placeId = optionalString(place.id);
    const address = optionalString(place.formattedAddress);
    const name = optionalString(place.displayName) ?? address ?? placeId;
    if (!name) continue;

    hits.push({
      name,
      coordinate,
      distanceMeters: distanceMeters(center, coordinate),
      ...(placeId ? { placeId } : {}),
      ...(address ? { address } : {}),
      ...(optionalString(place.googleMapsURI) ? { googleMapsUrl: optionalString(place.googleMapsURI)! } : {}),
      ...(typeof place.rating === "number" && Number.isFinite(place.rating) ? { rating: place.rating } : {}),
      ...(typeof place.userRatingCount === "number" && Number.isFinite(place.userRatingCount)
        ? { reviewCount: place.userRatingCount }
        : {}),
      ...(optionalString(place.primaryType) ? { primaryType: optionalString(place.primaryType)! } : {}),
    });
  }

  hits.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
  return hits.slice(0, limit);
}
