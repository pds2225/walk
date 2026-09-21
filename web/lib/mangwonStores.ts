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

export interface RepresentativeMenu {
  readonly nameKo: string;
  readonly priceWon: number | null;
  readonly sourceUrl: string | null;
  readonly verificationStatus: VerificationStatus;
}

export interface StoreProduct {
  readonly nameKo: string;
  readonly priceKrw: number | null;
  readonly priceLabel: string | null;
  readonly descriptionKo: string | null;
}

export interface PurchaseInfo {
  readonly takeout: boolean | null;
  readonly dineIn: boolean | null;
  readonly orderNote: string | null;
  readonly sourceUrl: string | null;
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
  /** Street View pano ID는 런타임 조회 캐시일 뿐 점포 식별자가 아니다. */
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
  readonly businessHoursSource: string | null;
  readonly closedDays: string | null;
  readonly phone: string | null;
  readonly purchaseInfo: PurchaseInfo;
  readonly products: readonly StoreProduct[];
  readonly representativeMenu: RepresentativeMenu | null;
  readonly storeImages: readonly StoreImage[];
  readonly google: {
    /** Google Places API에서 확인된 Place ID만 이 필드에 넣는다. 현재 데이터는 모두 미확인이다. */
    readonly placeId: string | null;
    /** Google Maps 웹 URL의 g/11... 참조. Places API Place ID와 혼동하지 않는다. */
    readonly webReference: string | null;
    readonly mapsUrl: string;
    readonly lastCheckedAt: string;
  };
  readonly streetView: StreetViewInfo;
  readonly verification: StoreVerification;
}

const CHECKED_AT = "2026-09-13";
const OFFICIAL_BASE = "https://www.mangwonmarket.com/stores-restaurant-kr/?bmode=view&idx=";
const OFFICIAL_IMAGE_BASE = "https://cdn.imweb.me/upload/S20250716cde2ed46b87b5/";

function image(fileName: string, sourceUrl: string): StoreImage {
  return {
    url: `${OFFICIAL_IMAGE_BASE}${fileName}`,
    sourceType: "OFFICIAL",
    sourceUrl,
    attribution: "망원시장 공식 점포 안내",
    usageStatus: "OFFICIAL_SOURCE",
  };
}

function menu(nameKo: string, priceWon: number | null, sourceUrl: string | null): RepresentativeMenu {
  return { nameKo, priceWon, sourceUrl, verificationStatus: sourceUrl ? "SINGLE_SOURCE_VERIFIED" : "UNKNOWN" };
}

function product(nameKo: string, priceKrw: number | null, descriptionKo: string | null = null, priceLabel: string | null = null): StoreProduct {
  return { nameKo, priceKrw, priceLabel, descriptionKo };
}

function store(input: Omit<MangwonStore, "google" | "verification" | "phone" | "purchaseInfo"> & {
  readonly googleWebReference: string | null;
  readonly googleMapsUrl: string;
  readonly verificationMemo: string;
  readonly phone?: string | null;
  readonly purchaseInfo?: PurchaseInfo;
}): MangwonStore {
  const { googleWebReference, googleMapsUrl, verificationMemo, phone = null, purchaseInfo = { takeout: null, dineIn: null, orderNote: null, sourceUrl: null }, ...value } = input;
  const hasHours = value.businessHours !== null;
  const hasMenu = value.representativeMenu !== null || value.products.length > 0;
  const hasMenuPrice = value.representativeMenu?.priceWon !== null || value.products.some((item) => item.priceKrw !== null || item.priceLabel !== null);
  return {
    ...value, phone, purchaseInfo,
    google: { placeId: null, webReference: googleWebReference, mapsUrl: googleMapsUrl, lastCheckedAt: CHECKED_AT },
    verification: {
      storeExistence: "MULTI_SOURCE_VERIFIED",
      location: "MULTI_SOURCE_VERIFIED",
      navigationTarget: "FIELD_CHECK_REQUIRED",
      businessHours: hasHours ? "SINGLE_SOURCE_VERIFIED" : "UNKNOWN",
      products: hasMenu ? "SINGLE_SOURCE_VERIFIED" : "UNKNOWN",
      prices: hasMenuPrice ? "SINGLE_SOURCE_VERIFIED" : "UNKNOWN",
      images: value.storeImages.length > 0 ? "OFFICIAL_VERIFIED" : "RIGHTS_CHECK_REQUIRED",
      officialSource: value.officialSource ? "OFFICIAL_VERIFIED" : "UNKNOWN",
      lastVerifiedAt: CHECKED_AT,
      memo: verificationMemo,
    },
  };
}

const googleSearch = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

/** 공식 시장 음식점 목록 2페이지에서 corridor 인접 점포를 전수 반영한다. */
export const MANGWON_STORES: readonly MangwonStore[] = [
  store({
    id: "mangwon-hunhun-hotteok", nameKo: "훈훈호떡", nameEn: null, category: "호떡·디저트", address: "서울특별시 마포구 포은로6길 25",
    officialSource: `${OFFICIAL_BASE}167464653`,
    storeLocation: { latitude: 37.5559174, longitude: 126.9063682, source: "Google Maps representative coordinate", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5559174, longitude: 126.9063682, source: "Google Maps representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null, corridorSide: "UNKNOWN", corridorOrder: null, descriptionKo: "망원시장 공식 안내의 호떡 전문 점포", descriptionEn: null,
    businessHours: "화–일 11:00–20:30 · 월요일 휴무", businessHoursSource: "https://www.diningcode.com/profile.php?rid=S6FebqC0lJ5i", closedDays: "월요일",
    phone: null, purchaseInfo: { takeout: true, dineIn: true, orderNote: "지하 매장에 스탠딩 테이블 정보가 있으나 현장 확인 필요", sourceUrl: "https://www.diningcode.com/profile.php?rid=S6FebqC0lJ5i" },
    products: [product("옥수수호떡", 1500, "옥수수 반죽의 기본 호떡"), product("치즈닝호떡", 2000, "치즈 파우더 토핑"), product("인절미호떡", 2000, "인절미 파우더 토핑"), product("오레오호떡", 2000, "호떡 속과 겉에 오레오 토핑"), product("씨앗호떡", 2000, "씨앗·견과 토핑"), product("아이스크림 꿀호떡 (인절미/오레오)", 4000, "바닐라 아이스크림과 호떡 토핑", "여름 한정 정보"), product("핫초코", 2500), product("탄산음료", 1500), product("아이스티", 2000), product("스무디", 2500, "망고·블루베리·키위"), product("아메리카노", 2000)], representativeMenu: menu("옥수수호떡", 1500, "https://www.diningcode.com/profile.php?rid=S6FebqC0lJ5i"), storeImages: [image("3bdf35323689e.jpg", `${OFFICIAL_BASE}167464653`)],
    googleWebReference: "g/11qbc6cc09", googleMapsUrl: googleSearch("훈훈호떡 망원시장"),
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "yySLIeZga7pxywbtwdPysw", captureDate: "2018-04", quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 확인했다. 대표 메뉴·시간은 외부 정보로 교차 확인했으며 출입구는 현장 확인 전이다.",
  }),
  store({
    id: "mangwon-mat-itneun-jip", nameKo: "맛있는집", nameEn: null, category: "분식", address: "서울특별시 마포구 망원로8길 30",
    officialSource: `${OFFICIAL_BASE}167464646`,
    storeLocation: { latitude: 37.5561438, longitude: 126.906064, source: "Google Maps representative coordinate", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5561438, longitude: 126.906064, source: "Google Maps representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null, corridorSide: "UNKNOWN", corridorOrder: null, descriptionKo: "망원시장 공식 안내의 분식 점포", descriptionEn: null,
    businessHours: "화–일 10:00–22:00 · 월요일 휴무", businessHoursSource: "https://naknak.app/spots/kr-seoul-matinneun-jip-mangwon-market", closedDays: "월요일",
    phone: "02-326-2134", purchaseInfo: { takeout: true, dineIn: true, orderNote: "매장 식사·포장 정보가 공개되어 있음", sourceUrl: "https://www.diningcode.com/profile.php?rid=DCKq4Mx5EkHU" },
    products: [product("오튀김밥", 6000, "오징어튀김이 들어간 김밥", "공개 정보에 5,000원 표기도 있어 현장 확인"), product("오채김밥", 4000), product("야채김밥", 3500), product("꼬마김밥", 3500), product("치즈김밥", 4000), product("매운멸치김밥", 5000), product("새우김밥", 5000), product("참치김밥", 5000), product("떡볶이", 5000), product("고추튀김", 5000), product("수제튀김", 5000), product("튀김 1개", 1500), product("순대", 5000), product("어묵 무색", 500), product("어묵 파란색", 700)], representativeMenu: menu("오징어튀김 김밥", null, "https://naknak.app/spots/kr-seoul-matinneun-jip-mangwon-market"), storeImages: [image("34d9b91e80df6.jpg", `${OFFICIAL_BASE}167464646`)],
    googleWebReference: "g/11ghrgwcv5", googleMapsUrl: googleSearch("맛있는집 망원시장"),
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "cnmzJ4_mqvF364sPtlMKhw", captureDate: "2018-04", quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 확인했다. 대표 메뉴는 외부 소개에서 확인했지만 가격은 확인 전이며 출입구는 현장 확인 전이다.",
  }),
  store({
    id: "mangwon-busandaewon-eomuk", nameKo: "부산대원어묵", nameEn: null, category: "분식·어묵", address: "서울특별시 마포구 망원로8길 26",
    officialSource: `${OFFICIAL_BASE}167464639`,
    storeLocation: { latitude: 37.5562789, longitude: 126.9060128, source: "Google Maps representative coordinate", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5562789, longitude: 126.9060128, source: "Google Maps representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null, corridorSide: "UNKNOWN", corridorOrder: null, descriptionKo: "망원시장 공식 안내의 분식·어묵 점포", descriptionEn: null,
    businessHours: null, businessHoursSource: null, closedDays: null, phone: "02-373-4181", purchaseInfo: { takeout: null, dineIn: true, orderNote: "매장 안쪽 좌석 정보가 있으나 휴무일·포장 여부는 방문 전 확인", sourceUrl: "https://www.diningcode.com/profile.php?rid=dzmCRJMXlXRw" }, products: [product("떡볶이", 5000), product("야채김밥", 3500), product("매운멸치김밥", 5000), product("참치김밥", 5000), product("치즈김밥", 4000), product("새우김밥", 5000), product("어묵 (일반)", 500), product("어묵 (고급)", 700), product("수제튀김", 5000), product("고추튀김", 5000), product("순대", 5000)], representativeMenu: menu("떡볶이", 5000, "https://www.diningcode.com/profile.php?rid=dzmCRJMXlXRw"), storeImages: [image("6f4427d8ad1b2.jpg", `${OFFICIAL_BASE}167464639`)],
    googleWebReference: "g/11f64dd61l", googleMapsUrl: googleSearch("부산대원어묵 망원시장"),
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "CIHM0ogKEICAgICayb6gZA", captureDate: "2021-08", quality: "AVAILABLE_BUT_NOT_USEFUL", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 확인했다. 주변 pano는 점포 전면 확인에 부족할 수 있어 상세 화면에서 런타임 fallback을 허용한다.",
  }),
  store({
    id: "mangwon-qs-chicken", nameKo: "큐스", nameEn: null, category: "닭강정", address: "서울특별시 마포구 망원로8길 27",
    officialSource: `${OFFICIAL_BASE}167464641`,
    storeLocation: { latitude: 37.5562557, longitude: 126.9062372, source: "Google Maps representative coordinate", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5562557, longitude: 126.9062372, source: "Google Maps representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null, corridorSide: "UNKNOWN", corridorOrder: null, descriptionKo: "망원시장 공식 안내의 닭강정 점포", descriptionEn: null,
    businessHours: "매일 09:30–20:30", businessHoursSource: "https://www.diningcode.com/profile.php?rid=CjDKMXFW1jdO", closedDays: null,
    phone: "02-3143-5577", purchaseInfo: { takeout: true, dineIn: null, orderNote: "포장 중심 점포로 안내됨; 맛과 용량을 고른 뒤 주문", sourceUrl: "https://www.diningcode.com/profile.php?rid=CjDKMXFW1jdO" },
    products: [product("닭강정 컵", 5000, "한 가지 맛 선택"), product("닭강정 반마리", 10000, "두 가지 맛 선택"), product("닭강정 2/3마리", 14000, "세 가지 맛 선택"), product("닭강정 1마리", 17000, "세 가지 맛 선택"), product("닭강정 1마리반", 21000, "네 가지 맛 선택"), product("델리간장달콤 닭강정", 10000, "델리간장의 달콤한 맛"), product("오리지널양념 닭강정", 10000, "매콤달콤한 양념"), product("청양마요 닭강정", 10000, "청양고추·고추마요"), product("고추마늘간장 닭강정", 10000, "청양고추와 마늘간장"), product("후라이드 닭강정", 10000, "바삭한 후라이드 맛"), product("화이트크림 닭강정", 10000, "채소와 크림소스"), product("깐풍 닭강정", 10000, "매콤한 깐풍 소스"), product("치즈시즈닝 닭강정", 10000, "치즈 시즈닝"), product("캐찹탕수 닭강정", 10000, "케첩의 새콤달콤한 맛"), product("치즈머스타드 닭강정", 10000, "치즈와 머스타드"), product("과일 닭강정", 10000, "생과일 소스의 새콤달콤한 맛"), product("닭똥집 튀김", 10000, "바삭하고 쫄깃한 튀김"), product("사이즈 선택", null, "맛과 용량에 따라 달라짐", "가격 변동")], representativeMenu: menu("닭강정 컵", 5000, "https://www.diningcode.com/profile.php?rid=CjDKMXFW1jdO"), storeImages: [image("e1531d2d05d10.jpg", `${OFFICIAL_BASE}167464641`)],
    googleWebReference: "g/11g722cl0z", googleMapsUrl: googleSearch("큐스닭강정 망원시장"),
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "yySLIeZga7pxywbtwdPysw", captureDate: "2018-04", quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 교차 확인했다. 대표 메뉴·가격·시간은 외부 정보로 확인했으며 출입구는 현장 확인 전이다.",
  }),
  store({
    id: "mangwon-wooyirak-main", nameKo: "우이락 망원본점", nameEn: null, category: "전·튀김", address: "서울특별시 마포구 포은로8길 22",
    officialSource: `${OFFICIAL_BASE}167464636`,
    storeLocation: { latitude: 37.556453, longitude: 126.9059867, source: "Google Maps representative coordinate", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.556453, longitude: 126.9059867, source: "Google Maps representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null, corridorSide: "UNKNOWN", corridorOrder: null, descriptionKo: "망원시장 공식 안내의 고추튀김 전문 점포", descriptionEn: null,
    businessHours: "매일 11:00–22:00", businessHoursSource: "https://www.keyzard.cc/kim_coco_/nb/224189370335", closedDays: null,
    phone: "02-336-5564", purchaseInfo: { takeout: true, dineIn: true, orderNote: "포장 줄과 매장 이용이 분리될 수 있으며, 매장 이용은 웨이팅 후 태블릿 주문 정보가 있음", sourceUrl: "https://www.diningcode.com/profile.php?rid=I0l1OJxNIO5l" },
    products: [product("오리지날 고추튀김", 12000, "우이락 대표 메뉴"), product("통모짜치즈 고추튀김", 13000), product("매운양념고추튀김", 13000), product("콘소메 고추튀김", 13000), product("우이락 크림막걸리", 9500), product("분식세트", 26500, "국물떡볶이·고추튀김·쫀득 치즈꼬치"), product("불닭 로제떡볶이", 18000, "매콤한 로제 소스와 치킨 토핑"), product("국물떡볶이辛", 12000, "떡·당면·어묵채튀김·계란"), product("막걸리 조개 술찜", 26000), product("술찜 면추가 (후식 볶음면)", 5000), product("한우 곱창전골", 35000), product("한우 대창 닭볶음탕 (순살)", 28000), product("갓도리탕", 25000), product("보쌈", 27000), product("백합조개탕", 21000), product("부산오뎅탕", 22000), product("통오징어 해물짬뽕탕", 26000), product("한우 육회", 23000), product("아롱사태 수육 냉채", 26000), product("모둠전", 29000, "7가지 전 모둠"), product("해물파전", 18000), product("육새전", 23000, "소고기 육전과 새우전"), product("치즈 감자채전", 17000, "30cm 감자채전"), product("땡초 김치전", 15000), product("미나리 튀김", 13000), product("미나리 새우전", 18000), product("통두부 김치제육", 18000), product("참소라무침", 18000), product("납작만두 무침", 15000), product("갓김치 말이 냉쫄면", 8000), product("해장 홍합라면", 7500), product("우이락 비빔국수", 7000), product("트러플 감자튀김", 9500), product("콘옥수수알 튀김", 7500), product("들기름 짜계치", 7500), product("쫀득 치즈꼬치", 4500), product("주먹밥", 3000), product("볶음밥", 3000), product("콩고물 아이스크림", 6900), product("아롱사태 갓김치 전골", 36000), product("골뱅이무침", 22000), product("묵사발", 8000), product("황도", 8000), product("토마토 막걸리 하이볼", 6800), product("청귤 막걸리 하이볼", 6800), product("탕세트", 41800, "고추튀김·한우대창 닭볶음탕·주먹밥"), product("술찜세트", 41800, "고추튀김·막걸리 조개 술찜·볶음면"), product("전세트", 39800, "고추튀김·육새전·비빔국수")], representativeMenu: menu("오리지날 고추튀김", 12000, "https://polle.com/place/236wHA/%EC%9A%B0이락"), storeImages: [image("1f75b5859eb16.jpg", `${OFFICIAL_BASE}167464636`)],
    googleWebReference: "g/11j2v4mk2r", googleMapsUrl: googleSearch("우이락 망원본점"),
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "CIHM0ogKEICAgICayb6gZA", captureDate: "2021-08", quality: "AVAILABLE_BUT_NOT_USEFUL", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 확인했다. 시간은 외부 정보로 확인했지만 가격은 최신 메뉴판 확인 전이며 출입구는 현장 확인 전이다.",
  }),
  store({
    id: "mangwon-market-hand-kalguksu", nameKo: "망원시장손칼국수", nameEn: null, category: "칼국수·손수제비", address: "서울특별시 마포구 망원로8길 29",
    officialSource: `${OFFICIAL_BASE}167464648`,
    storeLocation: { latitude: 37.5561838, longitude: 126.9062886, source: "Address geocoded from verified store address", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5561838, longitude: 126.9062886, source: "Address representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null, corridorSide: "UNKNOWN", corridorOrder: null, descriptionKo: "망원시장 공식 안내의 칼국수·손수제비 점포", descriptionEn: null,
    businessHours: "매일 10:00–20:30", businessHoursSource: "https://www.diningcode.com/profile.php?rid=Ft4PXi0ZH1Gs", closedDays: null,
    products: [product("손칼국수", 5000)], representativeMenu: menu("손칼국수", 5000, "https://www.diningcode.com/profile.php?rid=Ft4PXi0ZH1Gs"), storeImages: [image("c48061eaf7f23.jpg", `${OFFICIAL_BASE}167464648`)],
    googleWebReference: null, googleMapsUrl: googleSearch("망원시장손칼국수"),
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: null, captureDate: null, quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 주소·외부 매장 정보를 확인했다. 대표점 좌표는 주소 기준이며 출입구와 보행 순서는 현장 확인 전이다.",
  }),
  store({
    id: "mangwon-jangteo-gukbap", nameKo: "망원장터국밥", nameEn: null, category: "국밥", address: "서울특별시 마포구 망원로8길 30",
    officialSource: `${OFFICIAL_BASE}167464647`,
    storeLocation: { latitude: 37.5561026, longitude: 126.906299, source: "Address representative coordinate", verifiedAt: CHECKED_AT, verificationStatus: "SINGLE_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5561026, longitude: 126.906299, source: "Address representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null, corridorSide: "UNKNOWN", corridorOrder: null, descriptionKo: "망원시장 공식 안내의 국밥 점포", descriptionEn: null,
    businessHours: null, businessHoursSource: null, closedDays: null, products: [], representativeMenu: null, storeImages: [image("cf7f1d084dca3.jpg", `${OFFICIAL_BASE}167464647`)],
    googleWebReference: null, googleMapsUrl: googleSearch("망원장터국밥 망원시장"),
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: null, captureDate: null, quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 corridor 인접 주소를 확인했다. 정확한 점포 출입구·메뉴·시간은 현장 또는 최신 점포 정보 확인 전이다.",
  }),
  store({
    id: "mangwon-twimaek-jip", nameKo: "망원튀맥집", nameEn: null, category: "튀김·맥주", address: "서울특별시 마포구 망원로8길 29",
    officialSource: `${OFFICIAL_BASE}167464645`,
    storeLocation: { latitude: 37.5561879, longitude: 126.906281, source: "Google Maps representative coordinate", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5561879, longitude: 126.906281, source: "Google Maps representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null, corridorSide: "UNKNOWN", corridorOrder: null, descriptionKo: "망원시장 공식 안내의 튀김·맥주 점포", descriptionEn: null,
    businessHours: "화–일 10:00–20:40 · 월요일 휴무", businessHoursSource: "https://www.diningcode.com/profile.php?rid=eKYyYrJfhKb0", closedDays: "월요일",
    products: [product("생맥주", 4500), product("고추튀김", null)], representativeMenu: menu("생맥주", 4500, "https://www.diningcode.com/profile.php?rid=eKYyYrJfhKb0"), storeImages: [image("9c7dbef2ddbdc.jpg", `${OFFICIAL_BASE}167464645`)],
    googleWebReference: "g/11m5q6tfhs", googleMapsUrl: googleSearch("망원튀맥집 망원시장"),
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: null, captureDate: null, quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 확인했다. 대표 메뉴·가격·시간은 외부 정보로 확인했으며 출입구는 현장 확인 전이다.",
  }),
  store({
    id: "mangwon-ogongchan", nameKo: "오공찬", nameEn: null, category: "반찬", address: "서울특별시 마포구 망원로8길 27",
    officialSource: `${OFFICIAL_BASE}167464643`,
    storeLocation: { latitude: 37.5565426, longitude: 126.9060578, source: "Address representative coordinate", verifiedAt: CHECKED_AT, verificationStatus: "SINGLE_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5565426, longitude: 126.9060578, source: "Address representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null, corridorSide: "UNKNOWN", corridorOrder: null, descriptionKo: "망원시장 공식 안내의 반찬 점포", descriptionEn: null,
    businessHours: null, businessHoursSource: null, closedDays: null, products: [product("반찬", null)], representativeMenu: menu("반찬(소)", 3000, "https://polle.com/place/4f4W3D/%EC%98%A4%EA%B3%B5%EC%B0%AC"), storeImages: [image("32641c24dda75.jpg", `${OFFICIAL_BASE}167464643`)],
    googleWebReference: null, googleMapsUrl: googleSearch("오공찬 망원시장"),
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: null, captureDate: null, quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 주소·외부 점포 정보를 확인했다. 대표점 좌표는 주소 기준이며 출입구·영업시간은 현장 확인 전이다.",
  }),
  store({
    id: "mangwon-jangchung-hanbang-jokbal", nameKo: "장충동한방족발", nameEn: null, category: "족발", address: "서울특별시 마포구 망원로8길 30",
    officialSource: `${OFFICIAL_BASE}167464640`,
    storeLocation: { latitude: 37.5561026, longitude: 126.906299, source: "Address representative coordinate", verifiedAt: CHECKED_AT, verificationStatus: "SINGLE_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5561026, longitude: 126.906299, source: "Address representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null, corridorSide: "UNKNOWN", corridorOrder: null, descriptionKo: "망원시장 공식 안내의 족발 점포", descriptionEn: null,
    businessHours: "11:00–21:00 · 수요일 휴무", businessHoursSource: "https://www.diningcode.com/profile.php?rid=YgFBtHezS06l", closedDays: "수요일",
    products: [product("족발 (중)", 24000)], representativeMenu: menu("족발 (중)", 24000, "https://www.diningcode.com/profile.php?rid=YgFBtHezS06l"), storeImages: [image("a451c13dc3be4.jpg", `${OFFICIAL_BASE}167464640`)],
    googleWebReference: null, googleMapsUrl: googleSearch("장충동한방족발 망원시장"),
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: null, captureDate: null, quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 주소·외부 영업/가격 정보를 확인했다. 대표점 좌표는 주소 기준이며 출입구는 현장 확인 전이다.",
  }),
  store({
    id: "mangwon-muchim-project", nameKo: "무침프로젝트", nameEn: null, category: "홍어무침", address: "서울특별시 마포구 망원로8길 26",
    officialSource: `${OFFICIAL_BASE}167464638`,
    storeLocation: { latitude: 37.5563024, longitude: 126.906072, source: "Address representative coordinate", verifiedAt: CHECKED_AT, verificationStatus: "SINGLE_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5563024, longitude: 126.906072, source: "Address representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null, corridorSide: "UNKNOWN", corridorOrder: null, descriptionKo: "망원시장 공식 안내의 홍어무침 점포", descriptionEn: null,
    businessHours: "매일 09:30–20:00", businessHoursSource: "https://www.diningcode.com/profile.php?rid=f7SR4lcTXfg7", closedDays: null,
    products: [product("홍어무침", null)], representativeMenu: menu("홍어무침 1인분", null, "https://www.diningcode.com/profile.php?rid=f7SR4lcTXfg7"), storeImages: [image("efcbd2018f941.jpg", `${OFFICIAL_BASE}167464638`)],
    googleWebReference: null, googleMapsUrl: googleSearch("무침프로젝트 망원시장"),
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: null, captureDate: null, quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 주소·외부 영업 정보를 확인했다. 가격은 최신 메뉴판 확인 전이며 출입구는 현장 확인 전이다.",
  }),
  store({
    id: "mangwon-chicken-gangjeong", nameKo: "망원닭강정", nameEn: null, category: "닭강정", address: "서울특별시 마포구 망원로8길 27",
    officialSource: `${OFFICIAL_BASE}167464637`,
    storeLocation: { latitude: 37.5565426, longitude: 126.9060578, source: "Google Maps place coordinate", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5565426, longitude: 126.9060578, source: "Google Maps representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null, corridorSide: "UNKNOWN", corridorOrder: null, descriptionKo: "망원시장 공식 안내의 닭강정 점포", descriptionEn: null,
    businessHours: "매일 09:30–20:30", businessHoursSource: "https://www.diningcode.com/profile.php?rid=F8txOKGX0WeR", closedDays: null,
    products: [product("닭강정 컵", 4000)], representativeMenu: menu("닭강정 컵", 4000, "https://www.diningcode.com/profile.php?rid=F8txOKGX0WeR"), storeImages: [image("07677186c905f.jpg", `${OFFICIAL_BASE}167464637`)],
    googleWebReference: "g/11t318w96q", googleMapsUrl: googleSearch("망원닭강정 망원시장"),
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: null, captureDate: null, quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 확인했다. 대표 메뉴·가격·시간은 외부 정보로 확인했으며 출입구는 현장 확인 전이다.",
  }),
  store({
    id: "mangwon-hunyi-bindaetteok", nameKo: "훈이네 빈대떡", nameEn: null, category: "빈대떡·포차", address: "서울특별시 마포구 포은로8길 22",
    officialSource: `${OFFICIAL_BASE}167464635`,
    storeLocation: { latitude: 37.5564314, longitude: 126.905984, source: "Google Maps place coordinate", verifiedAt: CHECKED_AT, verificationStatus: "MULTI_SOURCE_VERIFIED" },
    navigationTarget: { latitude: 37.5564314, longitude: 126.905984, source: "Google Maps representative coordinate; entrance not field-verified", verifiedAt: CHECKED_AT, verificationStatus: "FIELD_CHECK_REQUIRED" },
    streetViewLocation: null, corridorSide: "UNKNOWN", corridorOrder: null, descriptionKo: "망원시장 공식 안내의 빈대떡·포차 점포", descriptionEn: null,
    businessHours: "영업시간 변동 가능 · 방문 전 확인 필요", businessHoursSource: "https://www.diningcode.com/profile.php?rid=mgLCCbaa9Z6f", closedDays: null,
    products: [product("빈대떡", null), product("김치찜", null)], representativeMenu: menu("빈대떡", null, "https://www.diningcode.com/profile.php?rid=mgLCCbaa9Z6f"), storeImages: [image("f7c69a62e47f7.jpeg", `${OFFICIAL_BASE}167464635`)],
    googleWebReference: "g/11zf31zfq", googleMapsUrl: googleSearch("훈이네 빈대떡 망원시장"),
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: null, captureDate: null, quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 확인했다. 영업시간 변동 가능성이 있고 가격은 확인 전이며 출입구는 현장 확인 전이다.",
  }),
];

export interface MangwonPanoramaPoint {
  readonly id: string;
  readonly sequence: number;
  readonly storeId: string;
  readonly label: string;
  readonly coordinate: Coordinate;
}

/**
 * 메인 Demo에서 연결하는 5개 hotspot. pano ID를 고정하지 않고 실제 점포 대표 좌표를
 * Google Street View에 넘겨 런타임에서 가장 가까운 파노라마를 찾는다.
 */
export const MANGWON_PANORAMA_POINTS: readonly MangwonPanoramaPoint[] = [
  { id: "corridor-01", sequence: 1, storeId: "mangwon-hunhun-hotteok", label: "훈훈호떡", coordinate: { latitude: 37.5559174, longitude: 126.9063682 } },
  { id: "corridor-02", sequence: 2, storeId: "mangwon-busandaewon-eomuk", label: "부산대원어묵", coordinate: { latitude: 37.5562789, longitude: 126.9060128 } },
  { id: "corridor-03", sequence: 3, storeId: "mangwon-qs-chicken", label: "큐스", coordinate: { latitude: 37.5562557, longitude: 126.9062372 } },
  { id: "corridor-04", sequence: 4, storeId: "mangwon-chicken-gangjeong", label: "망원닭강정", coordinate: { latitude: 37.5565426, longitude: 126.9060578 } },
  { id: "corridor-05", sequence: 5, storeId: "mangwon-wooyirak-main", label: "우이락 망원본점", coordinate: { latitude: 37.556453, longitude: 126.9059867 } },
];

export function getMangwonStore(id: string): MangwonStore | null {
  return MANGWON_STORES.find((item) => item.id === id) ?? null;
}
