import type { Locale } from "./i18n";
import type { MangwonStore, StoreProduct } from "./mangwonStores";

/**
 * 모바일 Shop Detail 화면용 영어 copy다. 사실 데이터는 MANGWON_STORES에서
 * 읽고, 이 파일은 이미 확인된 한국어 값을 화면 언어에 맞게 번역만 한다.
 */
const STORE_NAME_EN: Record<string, string> = {
  "mangwon-hunhun-hotteok": "Hunhun Hotteok",
  "mangwon-mat-itneun-jip": "Matinneun Jip",
  "mangwon-busandaewon-eomuk": "Busan Daewon Eomuk",
  "mangwon-qs-chicken": "Q's Dakgangjeong",
  "mangwon-wooyirak-main": "Uirak Mangwon Main",
  "mangwon-market-hand-kalguksu": "Mangwon Market Hand-cut Noodles",
  "mangwon-jangteo-gukbap": "Mangwon Jangteo Gukbap",
  "mangwon-twimaek-jip": "Mangwon Twigim & Beer",
  "mangwon-ogongchan": "Ogongchan",
  "mangwon-jangchung-hanbang-jokbal": "Jangchung-dong Herbal Jokbal",
  "mangwon-muchim-project": "Muchim Project",
  "mangwon-chicken-gangjeong": "Mangwon Dakgangjeong",
  "mangwon-hunyi-bindaetteok": "Hooni's Bindaetteok",
};

const CATEGORY_EN: Record<string, string> = {
  "호떡·디저트": "Hotteok · Dessert",
  "분식": "Korean Street Food",
  "분식·어묵": "Korean Street Food · Fish Cake",
  "닭강정": "Dakgangjeong",
  "전·튀김": "Korean Pancakes · Fritters",
  "칼국수·손수제비": "Knife-cut Noodles · Sujebi",
  국밥: "Gukbap",
  "튀김·맥주": "Fritters · Beer",
  반찬: "Banchan",
  족발: "Jokbal",
  홍어무침: "Spicy Skate Salad",
  "빈대떡·포차": "Bindaetteok · Pocha",
};

const DESCRIPTION_EN: Record<string, string> = {
  "망원시장 공식 안내의 호떡 전문 점포": "A hotteok specialty shop listed by Mangwon Market.",
  "망원시장 공식 안내의 분식 점포": "A Korean street-food shop listed by Mangwon Market.",
  "망원시장 공식 안내의 분식·어묵 점포": "A street-food and fish-cake shop listed by Mangwon Market.",
  "망원시장 공식 안내의 닭강정 점포": "A dakgangjeong shop listed by Mangwon Market.",
  "망원시장 공식 안내의 고추튀김 전문 점포": "A specialty shop for stuffed chili pepper fritters listed by Mangwon Market.",
  "망원시장 공식 안내의 칼국수·손수제비 점포": "A knife-cut noodle and sujebi shop listed by Mangwon Market.",
  "망원시장 공식 안내의 국밥 점포": "A gukbap shop listed by Mangwon Market.",
  "망원시장 공식 안내의 튀김·맥주 점포": "A fritter and beer shop listed by Mangwon Market.",
  "망원시장 공식 안내의 반찬 점포": "A banchan shop listed by Mangwon Market.",
  "망원시장 공식 안내의 족발 점포": "A jokbal shop listed by Mangwon Market.",
  "망원시장 공식 안내의 홍어무침 점포": "A spicy skate salad shop listed by Mangwon Market.",
  "망원시장 공식 안내의 빈대떡·포차 점포": "A bindaetteok and pocha shop listed by Mangwon Market.",
};

const HOURS_EN: Record<string, string> = {
  "화–일 11:00–20:30 · 월요일 휴무": "Tue–Sun 11:00–20:30 · Closed Mon",
  "화–일 10:00–22:00 · 월요일 휴무": "Tue–Sun 10:00–22:00 · Closed Mon",
  "매일 09:30–20:30": "Daily 09:30–20:30",
  "매일 10:00–20:30": "Daily 10:00–20:30",
  "화–일 10:00–20:40 · 월요일 휴무": "Tue–Sun 10:00–20:40 · Closed Mon",
  "11:00–21:00 · 수요일 휴무": "11:00–21:00 · Closed Wed",
  "매일 09:30–20:00": "Daily 09:30–20:00",
  "매일 11:00–22:00": "Daily 11:00–22:00",
  "영업시간 변동 가능 · 방문 전 확인 필요": "Hours may vary · Check before visiting",
};

const ORDER_NOTE_EN: Record<string, string> = {
  "지하 매장에 스탠딩 테이블 정보가 있으나 현장 확인 필요": "Standing tables are mentioned for the basement shop; confirm onsite.",
  "매장 식사·포장 정보가 공개되어 있음": "Dine-in and takeout information is publicly listed.",
  "매장 안쪽 좌석 정보가 있으나 휴무일·포장 여부는 방문 전 확인": "Indoor seating is listed; check the closed day and takeout before visiting.",
  "포장 중심 점포로 안내됨; 맛과 용량을 고른 뒤 주문": "Primarily takeout; choose the flavor and size before ordering.",
  "포장 줄과 매장 이용이 분리될 수 있으며, 매장 이용은 웨이팅 후 태블릿 주문 정보가 있음": "Takeout and dine-in lines may differ; dine-in uses tablet ordering after the wait.",
};

const PRICE_LABEL_EN: Record<string, string> = {
  "공개 정보에 5,000원 표기도 있어 현장 확인": "Public listings also show KRW 5,000; confirm onsite",
  "여름 한정 정보": "Seasonal information",
  "가격 변동": "Price varies",
};

const MENU_EN: Record<string, string> = {
  "옥수수호떡": "Corn Hotteok",
  "치즈닝호떡": "Cheese Hotteok",
  "인절미호떡": "Injeolmi Hotteok",
  "오레오호떡": "Oreo Hotteok",
  "씨앗호떡": "Seed Hotteok",
  "아이스크림 꿀호떡 (인절미/오레오)": "Ice Cream Honey Hotteok (Injeolmi/Oreo)",
  핫초코: "Hot Chocolate",
  탄산음료: "Soft Drink",
  아이스티: "Iced Tea",
  스무디: "Smoothie",
  아메리카노: "Americano",
  오튀김밥: "Squid Fritter Gimbap",
  "오징어튀김 김밥": "Squid Fritter Gimbap",
  오채김밥: "Ochae Gimbap",
  야채김밥: "Vegetable Gimbap",
  꼬마김밥: "Mini Gimbap",
  치즈김밥: "Cheese Gimbap",
  매운멸치김밥: "Spicy Anchovy Gimbap",
  새우김밥: "Shrimp Gimbap",
  참치김밥: "Tuna Gimbap",
  떡볶이: "Tteokbokki",
  고추튀김: "Chili Pepper Fritter",
  수제튀김: "Handmade Fritters",
  "튀김 1개": "Single Fritter",
  순대: "Sundae",
  "어묵 무색": "Fish Cake · Plain",
  "어묵 파란색": "Fish Cake · Blue",
  "어묵 (일반)": "Fish Cake · Regular",
  "어묵 (고급)": "Fish Cake · Premium",
  "닭강정 컵": "Dakgangjeong Cup",
  "닭강정 반마리": "Half Chicken Dakgangjeong",
  "닭강정 2/3마리": "Two-thirds Chicken Dakgangjeong",
  "닭강정 1마리": "Whole Chicken Dakgangjeong",
  "닭강정 1마리반": "One-and-a-half Chicken Dakgangjeong",
  "델리간장달콤 닭강정": "Sweet Deli Soy Dakgangjeong",
  "오리지널양념 닭강정": "Original Sauce Dakgangjeong",
  "청양마요 닭강정": "Cheongyang Mayo Dakgangjeong",
  "고추마늘간장 닭강정": "Chili Garlic Soy Dakgangjeong",
  "후라이드 닭강정": "Fried Dakgangjeong",
  "화이트크림 닭강정": "White Cream Dakgangjeong",
  "깐풍 닭강정": "Kkanpung Dakgangjeong",
  "치즈시즈닝 닭강정": "Cheese Seasoning Dakgangjeong",
  "캐찹탕수 닭강정": "Ketchup Sweet-and-sour Dakgangjeong",
  "치즈머스타드 닭강정": "Cheese Mustard Dakgangjeong",
  "과일 닭강정": "Fruit Dakgangjeong",
  "닭똥집 튀김": "Fried Gizzard",
  "사이즈 선택": "Choose a Size",
  "오리지날 고추튀김": "Original Chili Pepper Fritter",
  "통모짜치즈 고추튀김": "Whole Mozzarella Chili Pepper Fritter",
  "매운양념고추튀김": "Spicy Sauce Chili Pepper Fritter",
  "콘소메 고추튀김": "Consommé Chili Pepper Fritter",
  "우이락 크림막걸리": "Uirak Cream Makgeolli",
  분식세트: "Street Food Set",
  "불닭 로제떡볶이": "Buldak Rosé Tteokbokki",
  "국물떡볶이辛": "Spicy Soup Tteokbokki",
  "막걸리 조개 술찜": "Makgeolli Clam Steam",
  "술찜 면추가 (후식 볶음면)": "Extra Noodles for the Steam (Fried Noodles)",
  "한우 곱창전골": "Korean Beef Intestine Hot Pot",
  "한우 대창 닭볶음탕 (순살)": "Korean Beef Daechang Dakbokkeumtang (Boneless)",
  갓도리탕: "Gat-dori-tang",
  보쌈: "Bossam",
  "백합조개탕": "Hard Clam Soup",
  부산오뎅탕: "Busan Fish Cake Soup",
  "통오징어 해물짬뽕탕": "Whole Squid Seafood Jjamppong Soup",
  "한우 육회": "Korean Beef Yukhoe",
  "아롱사태 수육 냉채": "Cold Beef Shank Salad",
  모둠전: "Assorted Korean Pancakes",
  해물파전: "Seafood Pajeon",
  육새전: "Beef and Shrimp Jeon",
  "치즈 감자채전": "Cheese Potato Jeon",
  "땡초 김치전": "Spicy Chili Kimchi Jeon",
  "미나리 튀김": "Minari Fritters",
  "미나리 새우전": "Minari Shrimp Jeon",
  "통두부 김치제육": "Tofu with Kimchi and Pork",
  참소라무침: "Whelk Salad",
  "납작만두 무침": "Flat Dumpling Salad",
  "갓김치 말이 냉쫄면": "Gat Kimchi Cold Noodles",
  "해장 홍합라면": "Mussel Hangover Ramen",
  "우이락 비빔국수": "Uirak Spicy Noodles",
  "트러플 감자튀김": "Truffle Fries",
  "콘옥수수알 튀김": "Corn Kernel Fritters",
  "들기름 짜계치": "Perilla Oil Jjapagetti with Cheese",
  "쫀득 치즈꼬치": "Chewy Cheese Skewer",
  주먹밥: "Rice Ball",
  볶음밥: "Fried Rice",
  "콩고물 아이스크림": "Soybean Powder Ice Cream",
  "아롱사태 갓김치 전골": "Beef Shank and Gat Kimchi Hot Pot",
  골뱅이무침: "Whelk Salad",
  묵사발: "Acorn Jelly Soup",
  황도: "Yellow Peach",
  "토마토 막걸리 하이볼": "Tomato Makgeolli Highball",
  "청귤 막걸리 하이볼": "Green Tangerine Makgeolli Highball",
  탕세트: "Hot Pot Set",
  술찜세트: "Steam Set",
  전세트: "Jeon Set",
  손칼국수: "Hand-cut Noodles",
  생맥주: "Draft Beer",
  반찬: "Banchan",
  "반찬(소)": "Banchan · Small",
  "족발 (중)": "Jokbal · Medium",
  홍어무침: "Spicy Skate Salad",
  "홍어무침 1인분": "Spicy Skate Salad · 1 serving",
  빈대떡: "Bindaetteok",
  김치찜: "Kimchi Stew",
};

export function localizeStoreName(store: MangwonStore, locale: Locale): string {
  return locale === "en" ? (store.nameEn ?? STORE_NAME_EN[store.id] ?? store.nameKo) : store.nameKo;
}

export function localizeCategory(category: string, locale: Locale): string {
  return locale === "en" ? (CATEGORY_EN[category] ?? category) : category;
}

export function localizeDescription(description: string | null, locale: Locale): string | null {
  if (!description) return null;
  return locale === "en" ? (DESCRIPTION_EN[description] ?? description) : description;
}

export function localizeHours(hours: string | null, locale: Locale): string | null {
  if (!hours) return null;
  return locale === "en" ? (HOURS_EN[hours] ?? hours) : hours;
}

export function localizeOrderNote(note: string | null, locale: Locale): string | null {
  if (!note) return null;
  return locale === "en" ? (ORDER_NOTE_EN[note] ?? note) : note;
}

export function localizeProductName(name: string, locale: Locale): string {
  return locale === "en" ? (MENU_EN[name] ?? name) : name;
}

export function localizePriceLabel(label: string | null, locale: Locale): string | null {
  if (!label) return null;
  return locale === "en" ? (PRICE_LABEL_EN[label] ?? label) : label;
}

export function localizeProduct(product: StoreProduct, locale: Locale): StoreProduct {
  return locale === "en"
    ? { ...product, nameKo: localizeProductName(product.nameKo, locale) }
    : product;
}
