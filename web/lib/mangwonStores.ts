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
  readonly phone: string | null;
  readonly purchaseInfo: PurchaseInfo;
  readonly products: readonly StoreProduct[];
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

const PURCHASE_SOURCES = {
  hunhun: "https://www.diningcode.com/profile.php?rid=S6FebqC0lJ5i",
  matItneunJip: "https://www.diningcode.com/profile.php?rid=DCKq4Mx5EkHU",
  busanDaewon: "https://www.diningcode.com/profile.php?rid=dzmCRJMXlXRw",
  qsChicken: "https://www.diningcode.com/profile.php?rid=CjDKMXFW1jdO",
  wooyirak: "https://www.diningcode.com/profile.php?rid=I0l1OJxNIO5l",
} as const;

function product(
  nameKo: string,
  priceKrw: number | null,
  descriptionKo: string | null = null,
  priceLabel: string | null = null,
): StoreProduct {
  return { nameKo, priceKrw, priceLabel, descriptionKo };
}

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
      businessHours: value.businessHours ? "SINGLE_SOURCE_VERIFIED" : "UNKNOWN",
      products: value.products.length > 0 ? "SINGLE_SOURCE_VERIFIED" : "UNKNOWN",
      prices: value.products.some((item) => item.priceKrw !== null || item.priceLabel !== null)
        ? "SINGLE_SOURCE_VERIFIED"
        : "UNKNOWN",
      images: "RIGHTS_CHECK_REQUIRED",
      officialSource: officialSource ? "OFFICIAL_VERIFIED" : "UNKNOWN",
      lastVerifiedAt: CHECKED_AT,
      memo: verificationMemo,
    },
  };
}

/**
 * 공식 시장 페이지·Google Maps 장소·공개 메뉴 정보에서 확인한 Demo v1 점포다.
 * 메뉴 가격은 공개 지도 정보 기준이며, 현장 가격·품절·영업 여부는 방문 전에 다시 확인한다.
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
    businessHours: "11:00–20:30 (화–일)",
    closedDays: "월요일",
    phone: null,
    purchaseInfo: { takeout: true, dineIn: true, orderNote: "지하 매장에 스탠딩 테이블 정보가 있으나 현장 확인 필요", sourceUrl: PURCHASE_SOURCES.hunhun },
    products: [
      product("옥수수호떡", 1500, "옥수수 반죽의 기본 호떡"),
      product("치즈닝호떡", 2000, "치즈 파우더 토핑"),
      product("인절미호떡", 2000, "인절미 파우더 토핑"),
      product("오레오호떡", 2000, "호떡 속과 겉에 오레오 토핑"),
      product("씨앗호떡", 2000, "씨앗·견과 토핑"),
      product("아이스크림 꿀호떡 (인절미/오레오)", 4000, "바닐라 아이스크림과 호떡 토핑", "여름 한정 정보"),
      product("핫초코", 2500),
      product("탄산음료", 1500),
      product("아이스티", 2000),
      product("스무디", 2500, "망고·블루베리·키위"),
      product("아메리카노", 2000),
    ],
    storeImages: [],
    googlePlaceId: "g/11qbc6cc09",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=%ED%9B%88%ED%9B%88%ED%98%B8%EB%96%A1%20%EB%A7%9D%EC%9B%90%EC%8B%9C%EC%9E%A5",
    officialSource: "https://www.mangwonmarket.com/stores-restaurant-kr/?bmode=view&idx=167464653",
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "yySLIeZga7pxywbtwdPysw", captureDate: "2018-04", quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 확인했다. 메뉴·가격·영업시간은 공개 지도 정보 기준이며, 좌표는 대표점이라 출입구는 현장 확인 전 상태다.",
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
    businessHours: "10:00–22:00",
    closedDays: "월요일",
    phone: "02-326-2134",
    purchaseInfo: { takeout: true, dineIn: true, orderNote: "매장 식사·포장 정보가 공개되어 있음", sourceUrl: PURCHASE_SOURCES.matItneunJip },
    products: [
      product("오튀김밥", 6000, "오징어튀김이 들어간 김밥", "공개 정보에 5,000원 표기도 있어 현장 확인"),
      product("오채김밥", 4000),
      product("야채김밥", 3500),
      product("꼬마김밥", 3500),
      product("치즈김밥", 4000),
      product("매운멸치김밥", 5000),
      product("새우김밥", 5000),
      product("참치김밥", 5000),
      product("떡볶이", 5000),
      product("고추튀김", 5000),
      product("수제튀김", 5000),
      product("튀김 1개", 1500),
      product("순대", 5000),
      product("어묵 무색", 500),
      product("어묵 파란색", 700),
    ],
    storeImages: [],
    googlePlaceId: "g/11ghrgwcv5",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=%EB%A7%9B%EC%9E%88%EB%8A%94%EC%A7%91%20%EB%A7%9D%EC%9B%90%EC%8B%9C%EC%9E%A5",
    officialSource: "https://www.mangwonmarket.com/stores-restaurant-kr/?bmode=view&idx=167464646",
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "cnmzJ4_mqvF364sPtlMKhw", captureDate: "2018-04", quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 확인했다. 메뉴·가격·영업시간은 공개 지도 정보 기준이며, 오튀김밥은 공개 출처 간 가격 표기가 달라 현장 확인이 필요하다.",
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
    businessHours: "09:00–20:30",
    closedDays: null,
    phone: "02-373-4181",
    purchaseInfo: { takeout: null, dineIn: true, orderNote: "매장 안쪽 좌석 정보가 있으나 휴무일·포장 여부는 방문 전 확인", sourceUrl: PURCHASE_SOURCES.busanDaewon },
    products: [
      product("떡볶이", 5000),
      product("야채김밥", 3500),
      product("매운멸치김밥", 5000),
      product("참치김밥", 5000),
      product("치즈김밥", 4000),
      product("새우김밥", 5000),
      product("어묵 (일반)", 500),
      product("어묵 (고급)", 700),
      product("수제튀김", 5000),
      product("고추튀김", 5000),
      product("순대", 5000),
    ],
    storeImages: [],
    googlePlaceId: "g/11f64dd61l",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=%EB%B6%80%EC%82%B0%EB%8C%80%EC%9B%90%EC%96%B4%EB%AC%B5%20%EB%A7%9D%EC%9B%90%EC%8B%9C%EC%9E%A5",
    officialSource: "https://www.mangwonmarket.com/stores-restaurant-kr/?bmode=view&idx=167464639",
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "CIHM0ogKEICAgICayb6gZA", captureDate: "2021-08", quality: "AVAILABLE_BUT_NOT_USEFUL", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 상세와 Google Maps 장소를 확인했다. 메뉴·가격·영업시간은 공개 지도 정보 기준이며, 좌표 주변에는 사용자 제작 pano가 있었지만 공식 Street View는 유용하지 않았다.",
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
    businessHours: "09:30–20:30",
    closedDays: null,
    phone: "02-3143-5577",
    purchaseInfo: { takeout: true, dineIn: null, orderNote: "포장 중심 점포로 안내됨; 맛과 용량을 고른 뒤 주문", sourceUrl: PURCHASE_SOURCES.qsChicken },
    products: [
      product("닭강정 컵", 5000, "한 가지 맛 선택"),
      product("닭강정 반마리", 10000, "두 가지 맛 선택"),
      product("닭강정 2/3마리", 14000, "세 가지 맛 선택"),
      product("닭강정 1마리", 17000, "세 가지 맛 선택"),
      product("닭강정 1마리반", 21000, "네 가지 맛 선택"),
      product("델리간장달콤 닭강정", 10000, "델리간장의 달콤한 맛"),
      product("오리지널양념 닭강정", 10000, "매콤달콤한 양념"),
      product("청양마요 닭강정", 10000, "청양고추·고추마요"),
      product("고추마늘간장 닭강정", 10000, "청양고추와 마늘간장"),
      product("후라이드 닭강정", 10000, "바삭한 후라이드 맛"),
      product("화이트크림 닭강정", 10000, "채소와 크림소스"),
      product("깐풍 닭강정", 10000, "매콤한 깐풍 소스"),
      product("치즈시즈닝 닭강정", 10000, "치즈 시즈닝"),
      product("캐찹탕수 닭강정", 10000, "케첩의 새콤달콤한 맛"),
      product("치즈머스타드 닭강정", 10000, "치즈와 머스타드"),
      product("과일 닭강정", 10000, "생과일 소스의 새콤달콤한 맛"),
      product("닭똥집 튀김", 10000, "바삭하고 쫄깃한 튀김"),
      product("사이즈 선택", null, "맛과 용량에 따라 달라짐", "가격 변동"),
    ],
    storeImages: [],
    googlePlaceId: "g/11g722cl0z",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=%ED%81%90%EC%8A%A4%EB%8B%AD%EA%B0%95%EC%A0%95%20%EB%A7%9D%EC%9B%90%EC%8B%9C%EC%9E%A5",
    officialSource: null,
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "yySLIeZga7pxywbtwdPysw", captureDate: "2018-04", quality: "CORRIDOR_VISIBLE", lastCheckedAt: CHECKED_AT },
    verificationMemo: "Google Maps와 DiningCode에서 망원시장 점포·주소를 교차 확인했다. 메뉴·가격·영업시간은 공개 지도 정보 기준이다. 공식 시장 목록에는 동일 상호 대신 망원닭강정 표기가 확인되어 공식 점포 상세는 연결하지 않았다.",
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
    businessHours: "11:00–22:00 (라스트오더 21:00)",
    closedDays: null,
    phone: "02-336-5564",
    purchaseInfo: { takeout: true, dineIn: true, orderNote: "포장 줄과 매장 이용이 분리될 수 있으며, 매장 이용은 웨이팅 후 태블릿 주문 정보가 있음", sourceUrl: PURCHASE_SOURCES.wooyirak },
    products: [
      product("오리지날 고추튀김", 12000, "우이락 대표 메뉴"),
      product("통모짜치즈 고추튀김", 13000),
      product("매운양념고추튀김", 13000),
      product("콘소메 고추튀김", 13000),
      product("우이락 크림막걸리", 9500),
      product("분식세트", 26500, "국물떡볶이·고추튀김·쫀득 치즈꼬치"),
      product("불닭 로제떡볶이", 18000, "매콤한 로제 소스와 치킨 토핑"),
      product("국물떡볶이辛", 12000, "떡·당면·어묵채튀김·계란"),
      product("막걸리 조개 술찜", 26000),
      product("술찜 면추가 (후식 볶음면)", 5000),
      product("한우 곱창전골", 35000),
      product("한우 대창 닭볶음탕 (순살)", 28000),
      product("갓도리탕", 25000),
      product("보쌈", 27000),
      product("백합조개탕", 21000),
      product("부산오뎅탕", 22000),
      product("통오징어 해물짬뽕탕", 26000),
      product("한우 육회", 23000),
      product("아롱사태 수육 냉채", 26000),
      product("모둠전", 29000, "7가지 전 모둠"),
      product("해물파전", 18000),
      product("육새전", 23000, "소고기 육전과 새우전"),
      product("치즈 감자채전", 17000, "30cm 감자채전"),
      product("땡초 김치전", 15000),
      product("미나리 튀김", 13000),
      product("미나리 새우전", 18000),
      product("통두부 김치제육", 18000),
      product("참소라무침", 18000),
      product("납작만두 무침", 15000),
      product("갓김치 말이 냉쫄면", 8000),
      product("해장 홍합라면", 7500),
      product("우이락 비빔국수", 7000),
      product("트러플 감자튀김", 9500),
      product("콘옥수수알 튀김", 7500),
      product("들기름 짜계치", 7500),
      product("쫀득 치즈꼬치", 4500),
      product("주먹밥", 3000),
      product("볶음밥", 3000),
      product("콩고물 아이스크림", 6900),
      product("아롱사태 갓김치 전골", 36000),
      product("골뱅이무침", 22000),
      product("묵사발", 8000),
      product("황도", 8000),
      product("토마토 막걸리 하이볼", 6800),
      product("청귤 막걸리 하이볼", 6800),
      product("탕세트", 41800, "고추튀김·한우대창 닭볶음탕·주먹밥"),
      product("술찜세트", 41800, "고추튀김·막걸리 조개 술찜·볶음면"),
      product("전세트", 39800, "고추튀김·육새전·비빔국수"),
    ],
    storeImages: [],
    googlePlaceId: "g/11j2v4mk2r",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=%EC%9A%B0%EC%9D%B4%EB%9D%BD%20%EB%A7%9D%EC%9B%90%EB%B3%B8%EC%A0%90",
    officialSource: "https://www.mangwonmarket.com/stores-restaurant-kr/?bmode=view&idx=167464636",
    streetView: { available: true, latitude: null, longitude: null, distanceFromStore: null, headingAuto: null, headingOverride: null, pitch: 0, lastResolvedPanoId: "CIHM0ogKEICAgICayb6gZA", captureDate: "2021-08", quality: "AVAILABLE_BUT_NOT_USEFUL", lastCheckedAt: CHECKED_AT },
    verificationMemo: "공식 시장 점포 `우이락`과 Google Maps `우이락 망원본점`을 확인했다. 메뉴·가격·영업시간은 공개 지도 정보 기준이며, 좌표 주변에는 사용자 제작 pano가 있었지만 공식 Street View는 유용하지 않았다.",
  }),
];

export function getMangwonStore(id: string): MangwonStore | null {
  return MANGWON_STORES.find((item) => item.id === id) ?? null;
}
