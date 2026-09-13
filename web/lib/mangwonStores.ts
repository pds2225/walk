import type { Coordinate } from "./types";

export type VerificationStatus =
  | "OFFICIAL_VERIFIED"
  | "MULTI_SOURCE_VERIFIED"
  | "SINGLE_SOURCE_VERIFIED"
  | "FIELD_CHECK_REQUIRED"
  | "RIGHTS_CHECK_REQUIRED"
  | "UNKNOWN";

export type StreetViewQuality =
  | "EXACT_FRONTAGE"
  | "NEARBY_VISIBLE"
  | "CORRIDOR_VISIBLE"
  | "AVAILABLE_BUT_NOT_USEFUL"
  | "NOT_AVAILABLE";

export interface StoreImage {
  readonly url: string;
  readonly sourceType: "OFFICIAL" | "GOOGLE_USER" | "UNKNOWN";
  readonly sourceUrl: string | null;
  readonly attribution: string | null;
  readonly usageStatus: "APPROVED" | "OFFICIAL_SOURCE" | "ATTRIBUTION_REQUIRED" | "RIGHTS_CHECK_REQUIRED" | "DO_NOT_USE";
}

export interface VerifiedLocation extends Coordinate {
  readonly source: string;
  readonly verifiedAt: string;
  readonly verificationStatus: VerificationStatus;
}

export interface StreetViewInfo {
  readonly available: boolean;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly distanceFromStore: number | null;
  readonly headingAuto: number | null;
  readonly headingOverride: number | null;
  readonly pitch: number;
  readonly lastResolvedPanoId: string | null;
  readonly captureDate: string | null;
  readonly quality: StreetViewQuality;
  readonly lastCheckedAt: string;
}

export interface StoreVerification {
  readonly storeExistence: VerificationStatus;
  readonly location: VerificationStatus;
  readonly navigationTarget: VerificationStatus;
  readonly businessHours: VerificationStatus;
  readonly products: VerificationStatus;
  readonly prices: VerificationStatus;
  readonly images: VerificationStatus;
  readonly officialSource: VerificationStatus;
  readonly lastVerifiedAt: string;
  readonly memo: string;
}

export interface MangwonStore {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string | null;
  readonly category: string;
  readonly address: string;
  readonly officialSource: string | null;
  readonly storeLocation: VerifiedLocation;
  readonly navigationTarget: VerifiedLocation;
  readonly streetViewLocation: Coordinate | null;
  readonly corridorSide: "LEFT" | "RIGHT" | "UNKNOWN";
  readonly corridorOrder: number | null;
  readonly descriptionKo: string | null;
  readonly descriptionEn: string | null;
  readonly businessHours: string | null;
  readonly closedDays: string | null;
  readonly products: readonly string[];
  readonly storeImages: readonly StoreImage[];
  readonly google: {
    readonly placeId: string;
    readonly mapsUrl: string;
    readonly lastCheckedAt: string;
  };
  readonly streetView: StreetViewInfo;
  readonly verification: StoreVerification;
}

const CHECKED_AT = "2026-09-13";

function store(input: Omit<MangwonStore, "google" | "verification"> & {
  readonly googlePlaceId: string;
  readonly googleMapsUrl: string;
  readonly officialSource: string | null;
  readonly verificationMemo: string;
}): MangwonStore {
  const { googlePlaceId, googleMapsUrl, officialSource, verificationMemo, ...value } = input;
  return {
    ...value,
    officialSource,
    google: { placeId: googlePlaceId, mapsUrl: googleMapsUrl, lastCheckedAt: CHECKED_AT },
    verification: {
      storeExistence: "MULTI_SOURCE_VERIFIED",
      location: "MULTI_SOURCE_VERIFIED",
      navigationTarget: "FIELD_CHECK_REQUIRED",
      businessHours: "UNKNOWN",
      products: "UNKNOWN",
      prices: "UNKNOWN",
      images: "RIGHTS_CHECK_REQUIRED",
      officialSource: officialSource ? "OFFICIAL_VERIFIED" : "UNKNOWN",
      lastVerifiedAt: CHECKED_AT,
      memo: verificationMemo,
    },
  };
}

/**
 * 공식 시장 페이지와 Google Maps 장소 probe에서 확인한 Demo v1 점포만 둔다.
 * 영업시간·가격·사진·출입구 좌표는 확인 전까지 비워 둔다.
 */
export const MANGWON_STORES: readonly MangwonStore[] = [
  store({
    id: "mangwon-hunhun-hotteok",
    nameKo: "훈훈호떡",
    nameEn: null,
    category: "호떡·디저트",
    address: "서울특별시 마포구 포은로6길 25",
    storeLocation: { latitude: 37.5559174, longitude: 126.9063682, source: "Google Maps place coordinate", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5559174, longitude: 126.9063682, source: "Google Maps representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null,
    corridorSide: "UNKNOWN",
    corridorOrder: null,
    descriptionKo: null,
    descriptionEn: null,
    businessHours: null,
    closedDays: null,
    products: [],
    storeImages: [],
    googlePlaceId: "g/11qbc6cc09",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=%ED%9B%88%ED%9B%88%ED%98%B8%EB%96%A1%20%EB%A7%9D%EC%9B%90%EC%8B%9C%EC%9E%A5",
    officialSource: "https://www.mangwonmarket.com/stores-restaurant-kr/?bmode=view&idx=167464653",
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "yySLIeZga7pxywbtwdPysw", captureDate: "2018-04", quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 확인했다. 좌표는 대표점이며 출입구는 현장 확인 전 상태다.",
  }),
  store({
    id: "mangwon-mat-itneun-jip",
    nameKo: "맛있는집",
    nameEn: null,
    category: "분식",
    address: "서울특별시 마포구 망원로8길 30",
    storeLocation: { latitude: 37.5561438, longitude: 126.906064, source: "Google Maps place coordinate", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5561438, longitude: 126.906064, source: "Google Maps representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null,
    corridorSide: "UNKNOWN",
    corridorOrder: null,
    descriptionKo: null,
    descriptionEn: null,
    businessHours: null,
    closedDays: null,
    products: [],
    storeImages: [],
    googlePlaceId: "g/11ghrgwcv5",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=%EB%A7%9B%EC%9E%88%EB%8A%94%EC%A7%91%20%EB%A7%9D%EC%9B%90%EC%8B%9C%EC%9E%A5",
    officialSource: "https://www.mangwonmarket.com/stores-restaurant-kr/?bmode=view&idx=167464646",
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "cnmzJ4_mqvF364sPtlMKhw", captureDate: "2018-04", quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 확인했다. 메뉴·가격·영업시간은 이번 데이터셋에 채우지 않았다.",
  }),
  store({
    id: "mangwon-busandaewon-eomuk",
    nameKo: "부산대원어묵",
    nameEn: null,
    category: "분식·어묵",
    address: "서울특별시 마포구 망원로8길 26",
    storeLocation: { latitude: 37.5562789, longitude: 126.9060128, source: "Google Maps place coordinate", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5562789, longitude: 126.9060128, source: "Google Maps representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null,
    corridorSide: "UNKNOWN",
    corridorOrder: null,
    descriptionKo: null,
    descriptionEn: null,
    businessHours: null,
    closedDays: null,
    products: [],
    storeImages: [],
    googlePlaceId: "g/11f64dd61l",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=%EB%B6%80%EC%82%B0%EB%8C%80%EC%9B%90%EC%96%B4%EB%AC%B5%20%EB%A7%9D%EC%9B%90%EC%8B%9C%EC%9E%A5",
    officialSource: "https://www.mangwonmarket.com/stores-restaurant-kr/?bmode=view&idx=167464639",
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "CIHM0ogKEICAgICayb6gZA", captureDate: "2021-08", quality: "AVAILABLE_BUT_NOT_USEFUL", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 확인했다. 좌표 주변에는 사용자 제작 pano가 있었지만 Google UI에서 공식 Street View 이미지는 없다고 표시했다.",
  }),
  store({
    id: "mangwon-qs-chicken",
    nameKo: "큐스닭강정",
    nameEn: null,
    category: "닭강정",
    address: "서울특별시 마포구 망원로8길 27",
    storeLocation: { latitude: 37.5562557, longitude: 126.9062372, source: "Google Maps place coordinate", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5562557, longitude: 126.9062372, source: "Google Maps representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null,
    corridorSide: "UNKNOWN",
    corridorOrder: null,
    descriptionKo: null,
    descriptionEn: null,
    businessHours: null,
    closedDays: null,
    products: [],
    storeImages: [],
    googlePlaceId: "g/11g722cl0z",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=%ED%81%90%EC%8A%A4%EB%8B%AD%EA%B0%95%EC%A0%95%20%EB%A7%9D%EC%9B%90%EC%8B%9C%EC%9E%A5",
    officialSource: null,
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "yySLIeZga7pxywbtwdPysw", captureDate: "2018-04", quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "Google Maps와 DiningCode에서 망원시장 점포·주소를 교차 확인했다. 공식 시장 목록에는 동일 상호 대신 망원닭강정 표기가 확인되어 공식 점포 상세는 연결하지 않았다.",
  }),
  store({
    id: "mangwon-wooyirak-main",
    nameKo: "우이락 망원본점",
    nameEn: null,
    category: "전·튀김",
    address: "서울특별시 마포구 포은로8길 22",
    storeLocation: { latitude: 37.556453, longitude: 126.9059867, source: "Google Maps place coordinate", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.556453, longitude: 126.9059867, source: "Google Maps representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null,
    corridorSide: "UNKNOWN",
    corridorOrder: null,
    descriptionKo: null,
    descriptionEn: null,
    businessHours: null,
    closedDays: null,
    products: [],
    storeImages: [],
    googlePlaceId: "g/11j2v4mk2r",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=%EC%9A%B0%EC%9D%B4%EB%9D%BD%20%EB%A7%9D%EC%9B%90%EB%B3%B8%EC%A0%90",
    officialSource: "https://www.mangwonmarket.com/stores-restaurant-kr/?bmode=view&idx=167464636",
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "CIHM0ogKEICAgICayb6gZA", captureDate: "2021-08", quality: "AVAILABLE_BUT_NOT_USEFUL", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 `우이락`과 Google Maps `우이락 망원본점`을 확인했다. 좌표 주변에는 사용자 제작 pano가 있었지만 Google UI에서 공식 Street View 이미지는 없다고 표시했다.",
  }),
];

export function getMangwonStore(id: string): MangwonStore | null {
  return MANGWON_STORES.find((item) => item.id === id) ?? null;
}
