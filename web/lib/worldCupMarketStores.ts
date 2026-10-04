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

export interface WorldCupMarketStore {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string | null;
  /** 같은 블로그 중국어 글 제목에 따로 적힌 이름. 없으면 한국어 이름을 쓴다. */
  readonly nameZh: string | null;
  readonly category: string;
  readonly address: string;
  readonly officialSource: string | null;
  /** 블로그 글에 좌표가 없으면 null이다. 추정 좌표를 넣지 않는다. */
  readonly storeLocation: VerifiedLocation | null;
  readonly navigationTarget: VerifiedLocation | null;
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
    readonly placeId: string | null;
    readonly webReference: string | null;
    readonly mapsUrl: string | null;
    readonly lastCheckedAt: string;
  };
  readonly streetView: StreetViewInfo;
  readonly verification: StoreVerification;
}

interface StallInput {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly nameZh: string | null;
  readonly category: string;
  readonly address: string;
  readonly postUrl: string;
  readonly descriptionKo: string;
  readonly businessHours: string;
  readonly closedDays: string | null;
  readonly phone: string | null;
  readonly productNames: readonly string[];
  readonly takeout: boolean | null;
  readonly dineIn: boolean | null;
  readonly orderNote: string;
  readonly imageUrl: string;
  readonly verifiedAt: string;
  readonly corridorOrder: number;
}

function stall(input: StallInput): WorldCupMarketStore {
  const products = input.productNames.map((nameKo) => ({
    nameKo,
    priceKrw: null,
    priceLabel: null,
    descriptionKo: null,
  }));
  const representativeName = products[0]?.nameKo ?? null;
  return {
    id: input.id,
    nameKo: input.nameKo,
    nameEn: input.nameEn,
    nameZh: input.nameZh,
    category: input.category,
    address: input.address,
    officialSource: input.postUrl,
    storeLocation: null,
    navigationTarget: null,
    streetViewLocation: null,
    corridorSide: "UNKNOWN",
    corridorOrder: input.corridorOrder,
    descriptionKo: input.descriptionKo,
    descriptionEn: null,
    businessHours: input.businessHours,
    businessHoursSource: input.postUrl,
    closedDays: input.closedDays,
    phone: input.phone,
    purchaseInfo: {
      takeout: input.takeout,
      dineIn: input.dineIn,
      orderNote: input.orderNote,
      sourceUrl: input.postUrl,
    },
    products,
    representativeMenu: representativeName
      ? {
          nameKo: representativeName,
          priceWon: null,
          sourceUrl: input.postUrl,
          verificationStatus: "SINGLE_SOURCE_VERIFIED",
        }
      : null,
    storeImages: [
      {
        url: input.imageUrl,
        sourceType: "UNKNOWN",
        sourceUrl: input.postUrl,
        attribution: "소유자 블로그 https://m.blog.naver.com/mwwdc",
        usageStatus: "RIGHTS_CHECK_REQUIRED",
      },
    ],
    google: {
      placeId: null,
      webReference: null,
      mapsUrl: null,
      lastCheckedAt: input.verifiedAt,
    },
    streetView: {
      available: false,
      latitude: null,
      longitude: null,
      distanceFromStore: null,
      headingAuto: null,
      headingOverride: null,
      pitch: 0,
      lastResolvedPanoId: null,
      captureDate: null,
      quality: "NOT_AVAILABLE",
      lastCheckedAt: input.verifiedAt,
    },
    verification: {
      storeExistence: "SINGLE_SOURCE_VERIFIED",
      location: "UNKNOWN",
      navigationTarget: "UNKNOWN",
      businessHours: "SINGLE_SOURCE_VERIFIED",
      products: products.length > 0 ? "SINGLE_SOURCE_VERIFIED" : "UNKNOWN",
      prices: "UNKNOWN",
      images: "RIGHTS_CHECK_REQUIRED",
      officialSource: "SINGLE_SOURCE_VERIFIED",
      lastVerifiedAt: input.verifiedAt,
      memo: `${input.postUrl} 에 적힌 내용만 반영했다. 좌표, 파노라마 ID, 상품 가격은 이 글에 없다.`,
    },
  };
}

/** 소유자 블로그 매장 01–45. 블로그에 없는 점포는 포함하지 않는다. */
export const WORLD_CUP_MARKET_STORES: readonly WorldCupMarketStore[] = [
  stall({"id": "worldcup-market-01", "nameKo": "부부야채", "nameEn": "Bubu Vegetables", "nameZh": null, "category": "채소", "address": "서울 마포구 망원로7길 31", "postUrl": "https://m.blog.naver.com/mwwdc/224412430654", "descriptionKo": "망원동 장보기 필수 코스! 국내산만 취급하는 신선한 채소 가게입니다 빛깔 좋은 고구마부터 연근, 오이 등 매일매일 신선한 베스트셀러 채소들을 만나보세요! 믿고 먹을 수 있는 건강한 식재료가 필요할 때 망원동월드컵시장 매장 01번으로 방문해 보세요 부부야채", "businessHours": "08:00 ~ 19:00 (일요일 휴무)", "closedDays": "일요일", "phone": "02-2601-1777", "productNames": ["고구마", "연근", "오이"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리상품권, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTVfMjI5/MDAxNzg5NDQ4MDY0OTM1.7W29AW9-RdKWQJLF9FrJfLsrOmlNB37i-WEyYsK4nmUg.lUwav5RPz07FJoCxQF1zTIsyWDAtxkrOluAmzqg0RAMg.PNG/%EB%B6%80%EB%B6%80%EC%95%BC%EC%B1%84_(1).png?type=w800", "verifiedAt": "2026-09-15", "corridorOrder": 1}),
  stall({"id": "worldcup-market-02", "nameKo": "가락농산물", "nameEn": "Garak Nongsanmul", "nameZh": "嘉樂農產物", "category": "과일", "address": "서울 마포구 망원로7길 23", "postUrl": "https://m.blog.naver.com/mwwdc/224412440846", "descriptionKo": "과즙 팡팡 터지는 제철 과일 총집합! 망원동월드컵시장 2번 매장 '가락농산물'입니다. 당도 최고조에 달한 복숭아, 수박부터 아삭한 꿀사과까지! 깐깐하게 엄선한 고품질 과일만 취급하며, 무겁게 들고 가실 필요 없이 신속 배달해 드립니다. 밥 배 따로, 과일 배 따로! 지금 당장 한 입 싹~ 베어 물고 싶은 여러분의 최애 과일은 무엇인가요?", "businessHours": "08:00 ~ 21:00", "closedDays": null, "phone": "02-322-1120", "productNames": ["복숭아", "수박", "꿀사과"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이. 신속 배달", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTVfNjMg/MDAxNzg5NDQ4NjY4NDAz.nkUQnc_vAQqoByaN0NgJoazXBPB-a2g53tWtPDz_T2Yg.NZRhpTgZkUDNFtr93w7mwKmucSawuyrTLhkY6lx1tykg.PNG/1.png?type=w800", "verifiedAt": "2026-09-15", "corridorOrder": 2}),
  stall({"id": "worldcup-market-03", "nameKo": "흥부건어물", "nameEn": "Heungbu Dried Seafood", "nameZh": "興夫乾貨", "category": "건어물", "address": "서울 마포구 망원로7길 7", "postUrl": "https://m.blog.naver.com/mwwdc/224412449101", "descriptionKo": "맥주 안주 사러 왔다가 건강까지 챙겨가는 곳! 망원동월드컵시장 3번 매장 '흥부건어물'입니다. 두툼한 오징어와 바삭한 김 등 퀄리티 높은 건어물은 기본! 놀랍게도 최고급 홍삼과 인삼까지 한자리에서 만날 수 있는 반전 매력의 점포랍니다. 우리 집 주전부리부터 부모님 건강 선물까지 한 번에 해결해 보세요! ( 스와이프해서 매장 정보 확인) 짭조름한 오징어채 vs 기력 보충 홍삼, 지금 여러분의 장바구니에 담고 싶은 것은?", "businessHours": "09:00 ~ 19:40", "closedDays": null, "phone": "02-332-6625 / 010-5354-8682", "productNames": ["오징어", "김", "홍삼", "인삼"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTVfNDkg/MDAxNzg5NDQ5MDUzMTk2.rdenJAmrjsD7J4tqrASLzo_OkFE3s-4wK9Z1segTnV0g.ZjMozt9Dt2bNNT5vUIZFqN6P982cda6LlCJrDMx8w0Ug.PNG/1.png?type=w800", "verifiedAt": "2026-09-15", "corridorOrder": 3}),
  stall({"id": "worldcup-market-04", "nameKo": "무진장전집", "nameEn": "Mujinjang Jeon House", "nameZh": "無盡量煎餅店", "category": "곱창", "address": "서울 마포구 망원로7길 20", "postUrl": "https://m.blog.naver.com/mwwdc/224412451212", "descriptionKo": "망원동에서 왕십리 폼 미친 곱창을 찾았습니다... 간판은 '무진장전집'인데, 곱창 냄새에 홀려 들어갈 수밖에 없는 찐 로컬 맛집이에요! '(구)장수곱창'의 내공이 그대로 담긴 매콤달달 야채곱창에 당면 싹 올려서 먹으면 무조건 소주 부르는 맛입니다 통통한 돼지막창이랑 밥도둑 돼지고기 묵은지찜까지 완벽한 베스트셀러 3대장이니, 망원동월드컵시장 투어 가시면 여긴 무조건 저장해두고 들러보세요! 무진장전집", "businessHours": "11:00 ~ 23:00", "closedDays": null, "phone": "02-334-8295", "productNames": ["야채곱창", "돼지막창", "돼지고기 묵은지찜"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTVfMjcg/MDAxNzg5NDQ5MTI5MjI2.wek2G3XFKgkCcy2oIGWpMz5-PTfk3z2om4GYQ4hs9WEg.5nf3-MA96jMmcht62vudc-Q0g5oI1cJu8XJXdJstJRkg.PNG/1.png?type=w800", "verifiedAt": "2026-09-15", "corridorOrder": 4}),
  stall({"id": "worldcup-market-05", "nameKo": "돌쇠떡고을", "nameEn": "Dolsoe Tteokgoeul", "nameZh": "石牛糕點村", "category": "떡", "address": "서울 마포구 망원로7길 3 1층", "postUrl": "https://m.blog.naver.com/mwwdc/224412453183", "descriptionKo": "떡순이 떡돌이들 무조건 저장 새벽 3시부터 그날 팔 떡만 빚어내는 망원동 찐 로컬 떡집 폼 미쳤습니다;; 영롱하게 꽉 찬 고명들 보이시나요? 베스트 메뉴인 '찰시루떡, 맵시루떡, 콩가루인절미'는 쫀득하고 고소한 맛이 남달라서 일찍 안 가면 품절각입니다. 망원동월드컵시장 투어 가시면 여긴 무조건 양손 무겁게 쟁여오기 약속 돌쇠떡고을", "businessHours": "06:00 ~ 17:00 (매주 화요일 휴무)", "closedDays": "화요일", "phone": "02-322-2210", "productNames": ["찰시루떡", "맵시루떡", "콩가루인절미"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTVfNTMg/MDAxNzg5NDQ5MjE5NzM0.7iCLJqOVBwGDtmmaqxTicU3AzAaBqhgx3Dqw-ZpXISQg.Y6-Z4423H1xE9DBmW4-CrHia_k7ECxAbNKRO9VmjnJYg.PNG/1.png?type=w800", "verifiedAt": "2026-09-15", "corridorOrder": 5}),
  stall({"id": "worldcup-market-06", "nameKo": "금계옥수수", "nameEn": "Geumgye Corn", "nameZh": "金溪玉米", "category": "주전부리", "address": "서울 마포구 망원로7길 6 제1층", "postUrl": "https://m.blog.naver.com/mwwdc/224412457251", "descriptionKo": "망원동 피플 주목! 요즘 망원동월드컵 시장에서 가장 핫한 주전부리 가게, '금계 옥수수'입니다. 대추칩부터 오란다, 고구마스틱, 옛날 과자까지 트렌디한 한국 스낵이 한곳에! 시장 나들이 필수 코스로 추천해요!", "businessHours": "09:00 ~ 19:30/20:00", "closedDays": null, "phone": "010-2229-7963", "productNames": ["대추칩", "오란다", "고구마스틱", "옛날 과자"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTVfMTYw/MDAxNzg5NDQ5MzM5ODIz.ndibVy-YrZtE9J_UWS4ukB4OmAkmxM2vd95oRCU3qf8g.1abcldShVqGrA6_D1_26Ho3WPAfvOuhNAyhdxkFKYmIg.PNG/1.png?type=w800", "verifiedAt": "2026-09-15", "corridorOrder": 6}),
  stall({"id": "worldcup-market-07", "nameKo": "송가한우마을", "nameEn": "Songga Korean Beef Town", "nameZh": "宋家韓牛村", "category": "정육", "address": "서울 마포구 망원로 79 1층", "postUrl": "https://m.blog.naver.com/mwwdc/224412460197", "descriptionKo": "오늘 저녁은 쫄깃하고 신선한 한돈 삼겹살 어때요? 소량 판매도 가능해서 혼자서도, 단둘이서도 부담 없이 구매할 수 있는 착한 정육점! ‘송가한우마을’에서 기분 좋은 고기 쇼핑하세요!", "businessHours": "08:00 ~ 20:00", "closedDays": null, "phone": "02-335-6494", "productNames": ["한돈 삼겹살"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTVfMTU0/MDAxNzg5NDQ5NDg5MDk4.MwiZdAaTN8At4a42ne9EVyo2H1Xr2Qb5hcPCzy68amwg.5tPtg_lziKt0Gw5wFVzD8plDtlpC5WKbQw4vp5atiOUg.PNG/1.png?type=w800", "verifiedAt": "2026-09-15", "corridorOrder": 7}),
  stall({"id": "worldcup-market-08", "nameKo": "충남수산", "nameEn": "Chungnam Seafood", "nameZh": "忠南水產", "category": "수산물", "address": "서울 마포구 망원로7길 4", "postUrl": "https://m.blog.naver.com/mwwdc/224412478736", "descriptionKo": "망원동월드컵시장 투어 필수 코스! 발걸음을 멈추게 하는 ASMR급 바삭함! 방금 튀겨내 황금빛 비주얼을 자랑하는 새우튀김, 향긋한 해산물 내음에 저절로 취하게 되는 곳입니다. 망원월드컵시장의 활기찬 분위기와 함께 겉바속촉의 진수를 느껴보세요!", "businessHours": "09:00 ~ 21:00", "closedDays": null, "phone": "02-337-3792", "productNames": ["새우튀김"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTVfNTMg/MDAxNzg5NDUwMzI5Mjg2.zscq3RYHZbtMEggqZgzHV8J0MTdBXGMz110qO0pAGxEg.e2YTs1RKYwBx7gRy54xtSHHt9PJr_zeoQSEuGqcu-J0g.PNG/1.png?type=w800", "verifiedAt": "2026-09-15", "corridorOrder": 8}),
  stall({"id": "worldcup-market-09", "nameKo": "패션타운", "nameEn": "Fashion Town", "nameZh": "時尚城", "category": "여성의류·신발", "address": "서울 마포구 망원로7길 13", "postUrl": "https://m.blog.naver.com/mwwdc/224412482001", "descriptionKo": "망원동 속 '고퀄리티 숨은 보석'을 찾아서! 월드컵시장 內 '패션타운'은 품질 좋은 메이커 여성의류와 신발이 가득한 곳입니다. 다른 곳에 없는 유니크한 상품들로 가득하니, 시장 오실 때 꼭 들러보세요!", "businessHours": "10:30 ~ 18:00", "closedDays": null, "phone": "010-7531-8835", "productNames": [], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfNTMg/MDAxNzg5NTM1Nzk4MzIy.dVHxfLekylghmVJbAGFlFmY0N9GRBTjQXabFJUyuYXog.gHE9q5PMrj1oAcY4ZukhNjwxOU9oYHdTi49R3EJO69gg.PNG/SE-83c502e6-7602-4e41-8b31-43e8f8bdae80.png?type=w800", "verifiedAt": "2026-09-15", "corridorOrder": 9}),
  stall({"id": "worldcup-market-10", "nameKo": "윤아네", "nameEn": "Yoonah's", "nameZh": "允雅家", "category": "버블호떡", "address": "서울시 마포구 망원로7길 13", "postUrl": "https://m.blog.naver.com/mwwdc/224412557185", "descriptionKo": "망원동 월드컵시장에서 만난 '최고 존엄'의 맛! 여기가 바로 전설의 버블호떡 명가 '윤아네'입니다. 기름기 없이 담백하고 쫄깃바삭한 식감에 한 번 반하고, 입안 가득 퍼지는 달콤함에 두 번 반하는 맛! 시장 나들이 필수 코스, 진짜 버블호떡을 만나보세요! (친절한 사장님의 잠옷 쇼핑은 덤 )", "businessHours": "11:00 ~ 20:30 (일 휴무)", "closedDays": "일요일", "phone": null, "productNames": ["버블호떡"], "takeout": null, "dineIn": null, "orderNote": "카드, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTVfMjMy/MDAxNzg5NDUzOTEyNDAx.XKkIoJ1z8481XyBeRSzLnpO739U_cwV8Lsrvoz66Jd0g.cR_aQ3slhVhUjF10A74pdGAGJSmGOdbniz_JT_fBHUsg.PNG/1.png?type=w800", "verifiedAt": "2026-09-15", "corridorOrder": 10}),
  stall({"id": "worldcup-market-11", "nameKo": "달인수제한방족발", "nameEn": "Dalin Handmade Herbal Pork Trotters", "nameZh": "達人手工韓方豬腳", "category": "족발", "address": "서울 마포구 망원로7길 24", "postUrl": "https://m.blog.naver.com/mwwdc/224413698434", "descriptionKo": "야들야들 입에서 녹는 한방 족발에 시원~한 복어해장국, 그리고 소주 한 잔! 부드럽고 담백한 맛이 일품인 '달인수제한방족발'입니다. 시장의 정겨운 분위기 속에서 편하게 드실 수 있도록 약 20석 규모의 깔끔한 홀이 마련되어 있어요! 족발의 쫀득함은 기본, 단골들의 찐 사랑을 받는 시원한 복어 요리(해장국, 껍질무침)와의 환상적인 궁합을 꼭 경험해 보세요.", "businessHours": "11:30 ~ 23:00", "closedDays": null, "phone": "02-332-1989", "productNames": ["한방 족발", "복어해장국", "복어 껍질무침"], "takeout": null, "dineIn": true, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjkz/MDAxNzg5NTM1NTcxNTQ2.zyyscpWjNdN_9XIMXV2oljW4g3AcGVUhWdUVAgiT0RMg.dwfRhKdNIwuX4CnfSJfCUHWZPMnJ3kwKk_3Qpxx-gw8g.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 11}),
  stall({"id": "worldcup-market-12", "nameKo": "토종한우백화점", "nameEn": "Tojong Korean Beef Market", "nameZh": "韓國土種韓牛百貨店", "category": "정육", "address": "서울 마포구 망원로7길 30 토종한우백화점", "postUrl": "https://m.blog.naver.com/mwwdc/224413700679", "descriptionKo": "눈앞에서 펼쳐지는 생생한 발골쇼! 신선함의 차원이 다른 정육점 농장에서 깐깐하게 직접 고른 한우 암소와 매일 매장에서 직접 작업하는 한돈을 만나보세요. 매일 열리는 발골쇼가 그 압도적인 신선함을 증명합니다. 질 좋은 고기를 가장 합리적인 가격에 득템할 수 있는 곳, '토종한우백화점'입니다.", "businessHours": "08:30 ~ 20:00 (1,3주 일 휴무)", "closedDays": "1,3주 일요일", "phone": "02-323-0906~7", "productNames": ["한우 암소", "한돈"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfNTgg/MDAxNzg5NTM1NjYzMTEz.08g9aj0m9GQP44k-_dBwMDaXpF1zznZ7wC-NBpKELegg.mqBwDBNd_dMTzAIvHHZOB3Ocse2eOeUgi0_h4zE6TS4g.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 12}),
  stall({"id": "worldcup-market-13", "nameKo": "무진장맛집", "nameEn": "Mujinjang Food Spot", "nameZh": "無盡量美食店", "category": "전·순대", "address": "서울시 마포구 망원로7길 13", "postUrl": "https://m.blog.naver.com/mwwdc/224413711378", "descriptionKo": "망원동 노포 감성, 3000원의 행복! 따끈따끈하게 갓 부쳐낸 전부터 정성껏 만든 순대와 시원한 식혜까지! 집에서 만든 것처럼 정성을 다해 맛있게 만듭니다. 시장 골목의 투박하고 정겨운 감성을 그대로 느끼며 앉아서 드시고 갈 수도 있어요. 망원동월드컵시장 오시면 꼭 들러보세요!", "businessHours": "11:00 ~ 21:00", "closedDays": null, "phone": "010-6712-1220", "productNames": ["전", "순대", "식혜"], "takeout": null, "dineIn": true, "orderNote": "카드", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfNDAg/MDAxNzg5NTM2MTE1MjEz.Ov5tsErSarhCFdQ-L0IIwDbbr_myxCv26xAtgRFLaowg.8yHlLXMhRnVYk3fM4kpYizdUOE2pKGgI37NIsMbwoqog.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 13}),
  stall({"id": "worldcup-market-14", "nameKo": "애기수산", "nameEn": "Aegi Seafood", "nameZh": "愛姬水產", "category": "수산물", "address": "서울 마포구 망원로7길 17 102호", "postUrl": "https://m.blog.naver.com/mwwdc/224413713111", "descriptionKo": "망원동 터줏대감! 40년 전통이 증명하는 싱싱한 수산물 40년 동안 한결같이 망원동월드컵시장을 지켜온 '애기수산'입니다. 신선함은 기본, 먹기 좋게 깔끔한 손질까지 완벽하게 해드립니다! 믿고 먹을 수 있는 갈치와 조기, 그리고 단골손님을 향한 푸짐한 덤까지 준비되어 있으니 언제든 들러주세요.", "businessHours": "09:00 ~ 22:00", "closedDays": null, "phone": "010-5282-3413", "productNames": ["갈치", "조기"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjcy/MDAxNzg5NTM2MjEzMjIy.TGPV0KHYmEdb-d4-dGg9pWuZ_QWsq2DSGZy4ixltLusg.CELQh7rgRvcJAKvmsOYdiGrVn0wtSYZgtCm59OyRfxkg.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 14}),
  stall({"id": "worldcup-market-15", "nameKo": "명성족발", "nameEn": "Myeongseong Pork Trotters", "nameZh": "名聲豬腳", "category": "족발", "address": "서울특별시 마포구 월드컵로25길 35", "postUrl": "https://m.blog.naver.com/mwwdc/224413714916", "descriptionKo": "하루에 3번 삶아내는 정성, 맛이 없을 수가 없지! 야들야들하고 쫀득한 식감의 비밀은 바로 정성! 최고의 맛을 자랑하는 '명성족발'입니다. 족발뿐만 아니라 숯불 직화로 구워 불향 가득한 닭발, 가마솥에서 직접 빚어 구운 한돈 떡갈비까지, 완벽한 야식 메뉴가 모두 모여있어요.", "businessHours": "09:00 ~ 21:00", "closedDays": null, "phone": "010-3781-7925", "productNames": ["족발", "닭발", "한돈 떡갈비"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMTI1/MDAxNzg5NTM2MjkyMDMw.cEkeeVe8M5TGx7RfS7cQ3JFxTBxqF35RwY-CCCtn6wgg.PUqMr_QwQaoiDa8FAzlH-yYPp0398u9e5NWS7r86eM4g.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 15}),
  stall({"id": "worldcup-market-16", "nameKo": "아부찌부대찌개", "nameEn": "Abujji Budae-jjigae", "nameZh": "阿布志部隊鍋", "category": "부대찌개", "address": "서울 마포구 망원로7길 7, 1층 3호", "postUrl": "https://m.blog.naver.com/mwwdc/224413716257", "descriptionKo": "배달앱 평점 5점 만점! 가성비 끝판왕 부대찌개 아부찌부대찌개 10여 년의 전통을 자랑하는 망원동월드컵시장 비조리 포장 전문점 캠핑이나 저녁 식사 메뉴로 간편하게 즐겨보세요.", "businessHours": "10:00 ~ 20:30", "closedDays": null, "phone": "02-336-5051", "productNames": ["부대찌개(비조리)", "안동식 찜닭(비조리)"], "takeout": true, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이. 비조리 포장 전문점", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjYw/MDAxNzg5NTM2MzY4Njc0.6H6MrO8hrfz-vxMBqa3HK2pX0IpV-jVr5y9l1Sx-v9Ag.bayelPavnvzgdfq3kfJ4GBSlx2ON-DhrNBRY1ZqAIFMg.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 16}),
  stall({"id": "worldcup-market-17", "nameKo": "수산킹", "nameEn": "Seafood King", "nameZh": "水產王", "category": "수산물", "address": "서울 마포구 월드컵로25길 35", "postUrl": "https://m.blog.naver.com/mwwdc/224413717875", "descriptionKo": "생선 요리의 완성은 깔끔한 손질! 수산물 손질의 끝판왕이 나타났습니다. 수산킹 \"생선의 완성은 손질이다!\" 최고의 품질을 자랑하는 싱싱한 수산물을 집에서 바로 요리하기 편하도록 완벽하게 손질해 드립니다. 통통한 전복, 밥도둑 자반고등어, 은빛 갈치 등 오늘 저녁 식탁을 풍성하게 채울 신선한 해산물을 수산킹에서 만나보세요!", "businessHours": "08:00 ~ 19:30", "closedDays": null, "phone": null, "productNames": ["전복", "자반고등어", "갈치"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjU1/MDAxNzg5NTM2NDM3ODQ2.Yhf2f0mna4uoFew2CJGcw_sJExUmX0XhMdjWJkHdUVQg.CE2eX0LIQbTMW7atrG7q_bvTvzxgK-jGZbo-kLAwEykg.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 17}),
  stall({"id": "worldcup-market-18", "nameKo": "거두식품", "nameEn": "Geodoo Foods", "nameZh": "巨頭食品", "category": "생닭·오리", "address": "서울 마포구 망원로7길 20", "postUrl": "https://m.blog.naver.com/mwwdc/224413720695", "descriptionKo": "생닭, 생오리 요리할 때 손질 걱정 끝! 원하시는 대로 완벽하게 맞춤 손질해 드립니다. 거두식품 신선한 생닭, 토종닭, 오리 전문점입니다. 껍질 제거부터 뼈 발골, 부위별 컷팅까지! 집에서 요리하시기 가장 편하도록 손님이 원하시는 스타일에 맞춰 100% 맞춤 손질(DIY)해 드립니다. 부담 없이 편하게 오셔서 원하시는 대로 주문해 보세요. 고소한 두부와 달콤한 식혜도 함께 만나보실 수 있습니다!", "businessHours": "08:00 ~ 20:00 (매주 월요일 휴무)", "closedDays": "월요일", "phone": "02-326-2313", "productNames": ["생닭", "토종닭", "오리", "두부", "식혜"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjUg/MDAxNzg5NTM2NTEwNTg0.hAsb94jz4pLFGD8xRVPKoEZmoH2fcXeB3XhwrJ75XLQg.knIL7zkaSp1cVz7nhM8MQ7st_HLJqsX0wBCh6TgqgQ0g.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 18}),
  stall({"id": "worldcup-market-19", "nameKo": "미향이네", "nameEn": "Mihyang's", "nameZh": "美香家", "category": "악세사리", "address": "서울시 마포구 망원로7길 13", "postUrl": "https://m.blog.naver.com/mwwdc/224413722923", "descriptionKo": "\"예쁜 건 많은데 가격은 착하다! 역시 시장이 싸긴 싸구나! \" 미향이네 머리핀, 헤어밴드부터 가방과 모자까지! 다양한 악세사리를 정말 저렴한 가격에 득템할 수 있는 보물창고 '미향이네'입니다. 부담 없는 착한 가격으로 기분 전환할 예쁜 아이템들을 쏙쏙 골라가세요!", "businessHours": "09:30 ~ 19:30", "closedDays": null, "phone": null, "productNames": ["머리핀", "헤어밴드", "가방", "모자"], "takeout": null, "dineIn": null, "orderNote": "카드, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMTgy/MDAxNzg5NTM2NjQ0Mzk2.3ek0uj-Pf82KxSA9OAFmFW9A-UXGMPwR0cj3Ra5gFicg.GBUZZW8fLLpe1qjEAJILDR7I_DcRtZYvh_DoM-joOOQg.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 19}),
  stall({"id": "worldcup-market-20", "nameKo": "월드컵신발", "nameEn": "World Cup Shoes", "nameZh": "世界盃鞋店", "category": "신발", "address": "서울시 마포구 망원로7길 13", "postUrl": "https://m.blog.naver.com/mwwdc/224413724445", "descriptionKo": "매장은 작지만 신발은 무한대! 'Feel The K-Vibe' 가득한 망원동 월드컵 시장의 보물창고, '월드컵 신발'입니다! 작은 가게에 빼곡하게 들어찬 무한한 신발의 숲을 직접 경험해보세요. 무엇을 상상하든 그 이상의 다양성을 만날 수 있습니다!", "businessHours": "09:00 ~ 19:00", "closedDays": null, "phone": "010-9019-2242", "productNames": [], "takeout": null, "dineIn": null, "orderNote": "카드", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMTY2/MDAxNzg5NTM2NzQ2NTE2.wElhn_Viq8Z8aZW5MmLEGkatDGfXlrnJ8I-0Icxrc_Ag.OrhpRh1Hg0AZZsbGGW2F1QxaOvah7mpxQ3S0RLZEGzMg.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 20}),
  stall({"id": "worldcup-market-21", "nameKo": "예그린식품", "nameEn": "Yegrin Foods", "nameZh": "藝格琳食品", "category": "어묵", "address": "서울 마포구 망원로7길 17", "postUrl": "https://m.blog.naver.com/mwwdc/224413728095", "descriptionKo": "어묵의 신세계를 만나는 순간! 망원동 월드컵 시장, 예그린식품! 주문 즉시 갓 튀긴 어묵으로, 쫄깃하고 바삭한 '맛의 신세계'를 경험해보세요. 다양한 종류의 모듬 어묵이 기다리고 있습니다! 예그린식품", "businessHours": "06:00 ~ 21:00", "closedDays": null, "phone": "02-332-3655", "productNames": ["모듬 어묵"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjg1/MDAxNzg5NTM2ODIwOTc2.OPKBY77QbjcyuQ4RnlHhASCUXcKNn8NlFWOwLNsmDNEg.hINrHU9IhIIRKXNe-wYEKsrc09Tc2nJVaaashRstJ2Eg.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 21}),
  stall({"id": "worldcup-market-22", "nameKo": "동명식자재", "nameEn": "Dongmyeong Food Supplies", "nameZh": "東明食材店", "category": "식자재", "address": "서울 마포구 망원로7길 23", "postUrl": "https://m.blog.naver.com/mwwdc/224413730052", "descriptionKo": "식자재 잔뜩 샀는데 무겁다구요? 걱정 마세요, 배달해드립니다! 동명식자재 각종 공산품부터 음료와 주류까지, 없는 게 없는 정직한 식자재 전문 매장입니다. 무거운 장바구니는 저희에게 맡겨주세요! 4만 원 이상 구매 시 집 앞까지 편안하게 배달해 드립니다.", "businessHours": "05:00 ~ 19:00 (일요일 휴무)", "closedDays": "일요일", "phone": "010-6223-8092", "productNames": ["식자재", "공산품", "주류", "음료"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이. 4만 원 이상 구매 시 집 앞까지 배달", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjU4/MDAxNzg5NTM2OTkyNzAw.saJaZvZA63HUxRfSwEI86tDl9H5Xv_G7DtPMo1X4Wqcg.xKTERJ3fVtbVu6-pL8waAkH-kxwxBJMhjlJc29rYkTcg.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 22}),
  stall({"id": "worldcup-market-23", "nameKo": "삼해수산", "nameEn": "Samhae Seafood", "nameZh": "三海水產", "category": "수산물", "address": "서울 마포구 망원로7길 31", "postUrl": "https://m.blog.naver.com/mwwdc/224413731957", "descriptionKo": "바다의 신선함을 그대로 식탁으로! 싱싱함과 친절함이 가득한 '삼해수산'", "businessHours": "07:00 ~ 20:00", "closedDays": null, "phone": "010-4600-5638", "productNames": ["오징어", "갈치", "자반"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMTQw/MDAxNzg5NTM3MDcxNTE2.hnOKbI08ZQ65ZcY_7uLE1mPg6mGOvfNHejcxh4EKMQYg.y9XPfpmVdyg1uWVrvOv6-TAgaoGFz_h-SweSlCYnXpcg.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 23}),
  stall({"id": "worldcup-market-24", "nameKo": "남도청과", "nameEn": "Namdo Fruits", "nameZh": "南道水果店", "category": "과일", "address": "서울 마포구 망원로7길 28", "postUrl": "https://m.blog.naver.com/mwwdc/224413734092", "descriptionKo": "과일 고르는 데 늘 진심인 사장님! 믿고 찾는 오랜 단골들의 성지 '남도청과'", "businessHours": "09:00 ~ 20:00 (일요일 휴무)", "closedDays": "일요일", "phone": "02-335-5669", "productNames": ["사과", "딸기", "수박", "복숭아"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjk4/MDAxNzg5NTM3MTYwNjIx.AHlrUrJgYOeAu9NM338mAuxPdCneIagSyuitKIbfL7Yg.RlxYH5g8Dkfcnp2ZP5Nypum_bIhIJyGyu_9FWBUaCkMg.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 24}),
  stall({"id": "worldcup-market-25", "nameKo": "월드축산물", "nameEn": "World Butcher Shop", "nameZh": "世界肉品店", "category": "정육", "address": "서울 마포구 망원로7길 24", "postUrl": "https://m.blog.naver.com/mwwdc/224413754660", "descriptionKo": "믿고 먹는 신선한 한돈·한우 전문! 언제나 고객 만족을 최우선으로 생각하는 '월드축산물'", "businessHours": "08:00 ~ 19:30 (일요일 휴무)", "closedDays": "일요일", "phone": "010-3866-8893", "productNames": ["한돈", "한우", "수입육"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMTA4/MDAxNzg5NTM4MDQ5MTIz.VkQ7T6jd_QFVeOTZNPj-JY2ykVxKO33DWpaXV4-oQbog.ADRm2C-egbeYr3q18VXeDRUWsyG_2DHYCNcM83jMKP8g.PNG/1.png?type=w800", "verifiedAt": "2026-09-16", "corridorOrder": 25}),
  stall({"id": "worldcup-market-26", "nameKo": "어사또", "nameEn": "Eosatto Seafood", "nameZh": "魚士道水產", "category": "수산물", "address": "서울 마포구 망원로7길 20", "postUrl": "https://m.blog.naver.com/mwwdc/224413757089", "descriptionKo": "수백 가지 수산물이 한자리에! 망원동월드컵시장 속 해산물 천국 신선하고 다양한 수산물을 만날 수 있는 어사또입니다. 오징어부터 전복, 갈치까지 다양한 수산물을 만나보세요! ⏰ 06:00~20:00", "businessHours": "06:00 ~ 20:00", "closedDays": null, "phone": "010-4143-7310", "productNames": ["오징어", "전복", "갈치"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfNDgg/MDAxNzg5NTM4MjE4ODE5.sOT79dKZ28s-eHl43-g5BpoTzPG9sf4uwvQONwjemXwg.WfLZ6k1znPGtf7pH3cYw0115R06AdV69N-ejTf9jdxwg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 26}),
  stall({"id": "worldcup-market-27", "nameKo": "다나와생활용품 망원점", "nameEn": "Danawa Household Goods", "nameZh": "多拿我生活用品・望遠店", "category": "생활용품", "address": "서울 마포구 망원로7길 19", "postUrl": "https://m.blog.naver.com/mwwdc/224413759980", "descriptionKo": "“이런 것도 있어?” 찾기 힘든 생활용품까지 한곳에! 망원동의 생활용품 만물상, 다나와생활용품 망원점 밀폐용기부터 소형가전, 화장품, 철물까지 다양한 생활용품을 만나보세요. ⏰ 08:00~21:00 · 명절만 휴무 생활용품", "businessHours": "08:00 ~ 21:00 (명절만 휴무)", "closedDays": "명절", "phone": "02-326-0433", "productNames": ["밀폐용기", "소형가전", "화장품", "철물"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfOTMg/MDAxNzg5NTM4MzAyOTM1.9gRvkGFtRp-a711Yet_XwhvMTtoO6VL63rfro01lQDUg.q96FHYV-mJHzU3VScqTaIvQZs4hBhnlCDcyJzjV_hEAg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 27}),
  stall({"id": "worldcup-market-28", "nameKo": "만물고추방앗간", "nameEn": "Manmul Pepper Mill", "nameZh": "萬物辣椒磨坊", "category": "방앗간", "address": "서울 마포구 망원로7길 20", "postUrl": "https://m.blog.naver.com/mwwdc/224413770324", "descriptionKo": "한국의 맛을 담은 재료, 한곳에서 만나는 망원동월드컵시장 방앗간! 고춧가루, 참기름, 들기름부터 잡곡, 젓갈, 재래된장까지 한국의 맛을 담은 식재료를 만날 수 있는 만물고추방앗간입니다. 정직·청결·친절을 바탕으로 좋은 농산물과 다양한 먹거리를 소개합니다. ⏰ 09:00~19:30", "businessHours": "09:00 ~ 19:30", "closedDays": null, "phone": "010-5265-8270", "productNames": ["고춧가루", "참기름", "들기름", "잡곡", "젓갈", "재래된장"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMTU4/MDAxNzg5NTM4ODA2OTk4.YlGGRKytQpGSTxwAen8cnh_8oHPeneeZc25zS98TWiEg.BbQrP1LkTmo5feq9vQ8Z4mkXuJ0_9TVMJx3K2wUZ2pQg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 28}),
  stall({"id": "worldcup-market-29", "nameKo": "강화풍물", "nameEn": "Ganghwa Local Products", "nameZh": "江華風物", "category": "특산물", "address": "서울 마포구 망원로7길 13", "postUrl": "https://m.blog.naver.com/mwwdc/224413774926", "descriptionKo": "망원동에서 만나는 강화의 맛, 자연을 담은 특산물 가게! 건새우, 새우젓, 강정, 젤리까지 사계절 내내 다양한 강화 특산물을 만날 수 있는 강화풍물입니다. 강화의 특산물은 물론, 지리산의 좋은 먹거리도 함께 만나보세요. ⏰ 10:00~19:00", "businessHours": "10:00 ~ 19:00", "closedDays": null, "phone": "010-3785-3078", "productNames": ["건새우", "새우젓", "강정", "젤리"], "takeout": null, "dineIn": null, "orderNote": "카드", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjQ3/MDAxNzg5NTM5MDM0Mjc1.YYspzhbyq0ZSxYcKor0h_PfzUOS8j5r9LoGyKRZyeQQg.3mfDBBqePTXYL4gAqTkQ1POGXsvZUV_bkuXJK8Mx4Jwg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 29}),
  stall({"id": "worldcup-market-30", "nameKo": "반찬나라", "nameEn": "Banchan Nara", "nameZh": "韓式小菜王國", "category": "반찬", "address": "서울 마포구 월드컵로25길 33 1층", "postUrl": "https://m.blog.naver.com/mwwdc/224413776566", "descriptionKo": "반찬 고민? 100가지 반찬이 있는 반찬나라에서 한 번에 끝! 망원동월드컵시장에서 20년 동안 한자리를 지켜온 반찬나라. 전라도 김치부터 다양한 반찬과 국까지, 골라 먹는 재미가 가득해요. 오늘 저녁 반찬이 고민이라면 반찬나라에서 취향대로 골라보세요!", "businessHours": "09:30 ~ 19:30", "closedDays": null, "phone": "010-9954-8898", "productNames": ["전라도 김치", "반찬", "국"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjQ0/MDAxNzg5NTM5MTE2MDg5._cqCkBZI3b6PXjsrU5Z8qoe65zZUN66SmhHpJOBLOqsg.yCmQbcQlgACZdfXghbG6Nsm-jTXLVeaS1CEHxtxdYocg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 30}),
  stall({"id": "worldcup-market-31", "nameKo": "대왕주단이불", "nameEn": "Daewang Bedding & Quilts", "nameZh": "大王綢緞寢具", "category": "이불", "address": "서울 마포구 월드컵로25길 35", "postUrl": "https://m.blog.naver.com/mwwdc/224413778155", "descriptionKo": "50년을 지켜온 수제 이불의 품격, 대왕주단이불. 망원동월드컵시장에서 한자리 50년 전통을 이어온 대왕주단이불. 이불과 수예 제품을 전문으로 하며 오랫동안 단골손님들에게 사랑받아온 점포입니다.", "businessHours": "08:00 ~ 20:00", "closedDays": null, "phone": "010-7163-6561", "productNames": ["이불", "수예"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjM5/MDAxNzg5NTM5MjAwMDQ0.qOcYHbv-CJxm5s6yLll80cXDHJF6Ng6BA4zT1oBSUGIg.G9DP0RHEDHsMvgrUtFkvQWWMgOszfZk83u5PcDmIBSIg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 31}),
  stall({"id": "worldcup-market-32", "nameKo": "월드컵기름", "nameEn": "World Cup Oil Mill", "nameZh": "世界盃食用油店", "category": "기름", "address": "서울 마포구 월드컵로25길 35", "postUrl": "https://m.blog.naver.com/mwwdc/224413779906", "descriptionKo": "고소한 향부터 다른, 60년 전통의 시장 기름집 망원동월드컵시장 월드컵기름은 2대째 60년 전통을 이어온 기름 전문점입니다. 참기름·들기름을 직접 제조하고, 고춧가루도 직접 가공해 판매합니다. 참기름, 들기름, 고춧가루, 액젓까지 시장에서 믿고 찾는 기본 식재료를 만나보세요", "businessHours": "09:30 ~ 19:30 (일 휴무)", "closedDays": "일요일", "phone": "02-333-6909 / 010-2845-5208", "productNames": ["참기름", "들기름", "고춧가루", "액젓"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjQ3/MDAxNzg5NTM5MjY2MDkw.U1e0lStOV2_6PHq6JH9v7pqGk84w9m4FyWHjIZEHfrsg.PYeWzU2Eb9cR3Q8ll6yqcJrubKlhI-q2h7bh9rlTMGMg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 32}),
  stall({"id": "worldcup-market-33", "nameKo": "디자인데코", "nameEn": "Design Deco", "nameZh": "設計裝飾店", "category": "침구", "address": "서울 마포구 망원로7길 13 1층", "postUrl": "https://m.blog.naver.com/mwwdc/224413782369", "descriptionKo": "침구 쇼핑도 알차게, 디자인데코는 언제나 TAX FREE! 망원동월드컵시장 디자인데코는 이불, 카페트, 침대커버 등 다양한 침구류를 한자리에서 만나볼 수 있는 매장입니다. 월드컵시장 중앙에 위치해 있으며, 다양한 상품 구성과 TAX FREE 이용이 가능한 점이 특징입니다.", "businessHours": "09:00 ~ 20:30", "closedDays": null, "phone": "02-336-0999 / 010-3000-5772", "productNames": ["이불", "카페트", "침대커버"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이. TAX FREE", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjk2/MDAxNzg5NTM5MzQzMTUw.camg-RazGp4ZcE9hpEv-towZAufxZ1TPFB7Feqv08mwg.a8m5-bCa1-1NKq3Isj-PLeLJY7mn8vofVBSfAePyWZ0g.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 33}),
  stall({"id": "worldcup-market-34", "nameKo": "경남장식", "nameEn": "Gyeongnam Flooring", "nameZh": "慶南裝飾", "category": "장판·벽지", "address": "서울 마포구 망원로7길 7", "postUrl": "https://m.blog.naver.com/mwwdc/224413783734", "descriptionKo": "바닥부터 분위기까지, 깔끔한 시공이 다른 망원동 장판 가게 망원동월드컵시장 경남장식은 장판, 벽지, 버티컬을 취급하는 인테리어 전문점입니다. 깔끔한 시공과 친절한 응대로 필요한 공간에 맞는 제품을 만나볼 수 있습니다.", "businessHours": "07:30 ~ 19:30 (일 휴무)", "closedDays": "일요일", "phone": "02-334-1584", "productNames": ["장판", "벽지", "버티컬"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjY3/MDAxNzg5NTM5NDQ5Njg5.kzXsB2GJ0JMDfCAcayf01TxhQ9uMuGYRLg7bRJMgUFUg.JzJpaRYa9LXRaMLup6UK5rL7hoofVNWLOcfcVb3j1ocg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 34}),
  stall({"id": "worldcup-market-35", "nameKo": "쫑이네 야채", "nameEn": "Jjongi's Vegetables", "nameZh": "鐘伊蔬菜店", "category": "채소", "address": "서울 마포구 망원로7길 7", "postUrl": "https://m.blog.naver.com/mwwdc/224413788865", "descriptionKo": "새벽 시장의 신선함을 그대로, 오늘도 직접 골라온 채소 망원동월드컵시장 쫑이네야채는 매일 새벽 농수산물시장을 직접 방문해 좋은 상품을 꼼꼼히 선별해 판매합니다. 고구마, 감자, 양배추 등 신선한 채소를 믿고 만나보세요.", "businessHours": "08:00 ~ 20:00 (일 휴무)", "closedDays": "일요일", "phone": "02-336-6623 / 010-4686-8258", "productNames": ["고구마", "감자", "양배추"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfODMg/MDAxNzg5NTM5Njg1MDY3.Kh3uWmTpz8rJrdJVz-4EfYGq41CZYSkIMgaPnnxPOtEg.pZjCHpDjO2rhXaQUwZY636a5v0OHGNRMKRfW2Hs6cp8g.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 35}),
  stall({"id": "worldcup-market-36", "nameKo": "우리축산", "nameEn": "Woori Butcher Shop", "nameZh": "我們肉品店", "category": "정육", "address": "서울 마포구 망원로 82", "postUrl": "https://m.blog.naver.com/mwwdc/224413794826", "descriptionKo": "오로지 육우만 취급하는, 망원동 정육점의 믿을 수 있는 선택 망원동월드컵시장 우리축산은 육우만 전문으로 취급하는 정육점입니다. 등심과 소 특수부위 등 다양한 소고기를 만나볼 수 있어, 고기 본연의 매력을 찾는 분들께 추천드립니다.", "businessHours": "09:00 ~ 21:00", "closedDays": null, "phone": "010-9973-9013", "productNames": ["육우", "등심", "소 특수부위"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMTkg/MDAxNzg5NTM5OTQ3MDEx.veKXCfW__vZPIxfmCUlZ8kumpxNVOtNQ-NQM4M8yW8gg.R2Zx8ptrScPCvsmS8YhAY5LmB4JqyjzesExUuFvLC8kg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 36}),
  stall({"id": "worldcup-market-37", "nameKo": "소문난상회", "nameEn": "Somunnan Sanghoe", "nameZh": "知名蔬菜商店", "category": "채소", "address": "서울 마포구 망원로7길 3", "postUrl": "https://m.blog.naver.com/mwwdc/224413796680", "descriptionKo": "저렴하고 신선하게, 매일 빠르게 배송되는 소문난 채소가게 망원동월드컵시장 소문난상회는 손질양배추, 배추, 무, 청양고추 등 다양한 채소를 판매합니다. 매일 약 150곳의 식당·어린이집·교회 등에 신선한 상품을 빠르게 납품하며 오랫동안 거래하는 고객이 많은 점포입니다.", "businessHours": "04:00 ~ 19:00 (일 휴무)", "closedDays": "일요일", "phone": "010-8432-9436", "productNames": ["손질양배추", "배추", "무", "청양고추"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjMx/MDAxNzg5NTQwMDUwOTUw.AMHBR9mEvvpngvDbxYOH-a5Z9aKrsIG60-gsjVz6Nmsg.BZSXdAQzFNC6sbdwjJP7-Mnup7abbSMC_iB5lRQjoiog.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 37}),
  stall({"id": "worldcup-market-38", "nameKo": "곽가네기깔난게장 망원점", "nameEn": "Gwakgane Gikkalnan Gejang", "nameZh": "郭家招牌醬蟹・望遠店", "category": "게장", "address": "서울 마포구 망원로7길 4 1층", "postUrl": "https://m.blog.naver.com/mwwdc/224413864625", "descriptionKo": "시장 한가운데서 제대로 즐기는, 밥도둑 간장게장 망원동월드컵시장 곽가네 기깔난 게장 망원점은 간장게장, 양념게장, 낙지젓갈을 판매하는 게장 전문점입니다. 직접 만든 레시피로 차별화된 맛을 내며, 택배 포장과 비행기 포장도 가능합니다.", "businessHours": "10:00 ~ 19:30 (수 휴무)", "closedDays": "수요일", "phone": "010-2599-2619", "productNames": ["간장게장", "양념게장", "낙지젓갈"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이. 택배 포장, 비행기 포장 가능", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMTAz/MDAxNzg5NTQwMTk4NjUw.IQ1io91-UCZBPbX-NyHx-BO0MgdMTg1Tr9BeSDnQ-Swg.hJEEpf1GJulGw42X2wZAPeUc8KtgDTQqOEwLZfGyP4Ag.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 38}),
  stall({"id": "worldcup-market-39", "nameKo": "스마일청과", "nameEn": "Smile Fruits", "nameZh": "微笑水果店", "category": "과일", "address": "서울 마포구 망원로 81", "postUrl": "https://m.blog.naver.com/mwwdc/224413866627", "descriptionKo": "오늘 가장 맛있는 과일, 제철에 맞춰 골라보세요 망원동월드컵시장 스마일청과는 사과, 배를 비롯해 계절에 맞는 다양한 제철 과일을 판매하는 과일 전문점입니다. 신선하고 당도 좋은 과일을 찾는다면 시장에서 꼭 들러보세요.", "businessHours": "06:00 ~ 21:00", "closedDays": null, "phone": "010-2007-4986", "productNames": ["사과", "배"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjk2/MDAxNzg5NTQzMzI0NTc0.8kJwT1u2_GhCaPPV81cXxs3kQXQUic6qp0xY887YDn4g.Ef-nCrfy0mGySSQRyb8ojvsr6UaG6M_fuIlm-yWOVCkg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 39}),
  stall({"id": "worldcup-market-40", "nameKo": "재희네맛김", "nameEn": "Jaehee's Seasoned Seaweed", "nameZh": "在熙手工海苔", "category": "김", "address": "서울 마포구 망원로 81 1층", "postUrl": "https://m.blog.naver.com/mwwdc/224413868244", "descriptionKo": "매일 정성껏 구워내는, 바삭하고 고소한 100% 수제 맛김 망원동월드컵시장 재희네맛김은 국산 원초를 사용해 매일 직접 구워내는 수제 김 전문점입니다. 곱창맛김, 곱창김, 파래김 등 다양한 김을 만나볼 수 있으며, 불향과 바삭한 식감이 특징입니다.", "businessHours": "08:30 ~ 20:00 (2,4주 수 휴무)", "closedDays": "2,4주 수요일", "phone": "0110-3182-1665", "productNames": ["곱창맛김", "곱창김", "파래김"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMTY1/MDAxNzg5NTQzNDA4MDY5.BzoOYp8EBvenKT2p8VMVK0Ym3URi9v0PIPbxpG0sBDog.XklQzdiRFYpp2VYXyAcGBKd5u05EPNo7PctMZXrz45Ug.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 40}),
  stall({"id": "worldcup-market-41", "nameKo": "성산야채", "nameEn": "Seongsan Vegetables", "nameZh": "城山蔬菜店", "category": "야채", "address": "서울 마포구 망원로7길 13", "postUrl": "https://m.blog.naver.com/mwwdc/224413870618", "descriptionKo": "엄마 손맛으로 담근 제철 나물과 오이지, 성산야채에서 만나요! 매일 아침 들어오는 신선한 야채부터 직접 다듬고 손수 삶은 제철 나물, 아삭한 오이지까지. 정성 가득한 시장 반찬이 생각나는 날, 망원동월드컵시장 성산야채에 들러보세요.", "businessHours": "07:00 ~ 20:00", "closedDays": null, "phone": "02-337-0870", "productNames": ["제철 나물", "오이지"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMzAg/MDAxNzg5NTQzNTM3NzYx.KRJxAD5f1aUAkf8UgV0UqtHF5oEsnpDk_fYP1zUdkrgg.7QfeKyaTXoBOd4WRBSQT0EpU00sXuHurc-fIdj8c3esg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 41}),
  stall({"id": "worldcup-market-42", "nameKo": "백년손님 형제떡방", "nameEn": "Baeknyeon Sonnim Brothers Tteokbang", "nameZh": "百年客人・兄弟糕點房", "category": "떡", "address": "서울 마포구 망원로7길 28", "postUrl": "https://m.blog.naver.com/mwwdc/224413877020", "descriptionKo": "젊은 부부가 운영하는 떡집입니다. 일반 꿀떡, 인절미, 바람떡 같은 기본 떡뿐만 아니라 호박찰떡, 보리개떡처럼 특이한 떡도 있어요.", "businessHours": "09:00 ~ 19:00 (수 휴무)", "closedDays": "수요일", "phone": "010-8941-2608", "productNames": ["꿀떡", "인절미", "바람떡", "호박찰떡", "보리개떡"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMjQg/MDAxNzg5NTQzNjU4OTkz.ZzIA-8OWfSNRuwZdXOJH47oJKX3scA1DV3R9UsxT9JYg.pNTO60HMRc0GNCsxe9iATXxYMZN8ci1duGguP91hUlUg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 42}),
  stall({"id": "worldcup-market-43", "nameKo": "갱상도시래기", "nameEn": "Gyeongsang-do Siraegi", "nameZh": "慶尚道蕨菜店", "category": "시래기", "address": "서울 마포구 망원로7길 20 1층", "postUrl": "https://m.blog.naver.com/mwwdc/224413879128", "descriptionKo": "속 편하게 즐기는 깊은 맛, 시래기 한 끼의 정석 망원동월드컵시장에서 만나는 갱상도시래기. 들깨시래기, 시래기비빔밥, 시래기불고기처럼 남녀노소 누구나 편하게 즐길 수 있는 시래기 전문점입니다. 담백하면서도 깊은 맛이 생각나는 날, 든든한 한 끼 드시러 들러보세요.", "businessHours": "11:00 ~ 20:30 (15:00 ~ 17:00 브레이크타임) (목 휴무)", "closedDays": "목요일", "phone": "0110-5486-2129", "productNames": ["들깨시래기", "시래기비빔밥", "시래기불고기"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMTIx/MDAxNzg5NTQzOTY3ODI2.UdaoGc9XOvOuYmMMWsLmN2ysAWQxo1C8zKzQ6uyFYg4g.8eeAFwfzezQYhtd32mUPsRV8ykUIYWlJ8YqE9AF6S1cg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 43}),
  stall({"id": "worldcup-market-44", "nameKo": "한성커텐", "nameEn": "Hanseong Curtain Shop", "nameZh": "漢城窗簾店", "category": "커튼", "address": "서울 마포구 망원로7길 13", "postUrl": "https://m.blog.naver.com/mwwdc/224413880510", "descriptionKo": "40년의 손길로 완성하는 우리 집 맞춤 커튼 망원동월드컵시장의 한성커텐은 40년 전통의 커튼 전문점입니다. 커튼 판매부터 시공까지 가능하고, 서울 전 지역 방문과 확실한 A/S까지 제공합니다. 집 분위기를 바꾸고 싶다면 한성커텐에서 상담해보세요.", "businessHours": "9:00~19:00 (휴무:X)", "closedDays": null, "phone": "02-332-7165", "productNames": [], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이. 커튼 판매와 시공, 서울 전 지역 방문, A/S", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMTc0/MDAxNzg5NTQ0MDMzODY1.arrgr6pvtNh2lftOtIh-usoCh5viCHCRnNSTGyd8P7Eg.W9PxD7Q5IfVc-xUgFuhtuOHqPkO-bBjv_AhGdVdlAkMg.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 44}),
  stall({"id": "worldcup-market-45", "nameKo": "장터국밥", "nameEn": "Jangteo Gukbap", "nameZh": "市場湯飯", "category": "국밥", "address": "서울 마포구 망원로7길 20", "postUrl": "https://m.blog.naver.com/mwwdc/224413884748", "descriptionKo": "매일 가마솥에서 푹 끓여내는, 40년 장터국밥의 깊은 맛 망원동월드컵시장의 장터국밥은 40년 전통의 국밥집입니다. 육개장과 선지국을 비롯해 푸짐한 양과 부담 없는 가격으로 든든한 한 끼를 즐길 수 있어요. 매일 가마솥에 정성껏 끓여내는 시장표 국밥 한 그릇, 따끈하게 드셔보세요.", "businessHours": "12:00~19:00 (휴무:X)", "closedDays": null, "phone": null, "productNames": ["육개장", "선지국"], "takeout": null, "dineIn": null, "orderNote": "카드, 온누리, 제로페이, 서울페이", "imageUrl": "https://mblogthumb-phinf.pstatic.net/MjAyNjA5MTZfMTM2/MDAxNzg5NTQ0MjA2Nzk0.EV24RofopjLtfUE1TJ1LyCYqQcqtt7i44H4IkymoC4og.gw7wfLvcFDXC3-XYkLXTZSCbwo8-LHL_f4DtMLcyGc8g.PNG/1.png?type=w800", "verifiedAt": "2026-09-17", "corridorOrder": 45})
];


export function getWorldCupMarketStore(id: string): WorldCupMarketStore | null {
  return WORLD_CUP_MARKET_STORES.find((item) => item.id === id) ?? null;
}
