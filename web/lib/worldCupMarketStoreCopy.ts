import { getWorldCupMarketUiText, type Locale } from "./i18n";
import type { StoreProduct, WorldCupMarketCategoryGroup, WorldCupMarketStore } from "./worldCupMarketStores";
import { WORLD_CUP_MARKET_DESCRIPTIONS } from "./worldCupMarketDescriptions";
import { DETAIL_ADDRESS_COPY, DETAIL_HOURS_COPY, DETAIL_ORDER_COPY, DETAIL_PRICE_COPY, DETAIL_PRODUCT_COPY } from "./worldCupMarketDetailCopy";
import { WORLD_CUP_MARKET_NAME_READINGS } from "./worldCupMarketNameReadings";

/**
 * 화면 언어에 맞는 점포 표기.
 * 영어 이름과 중국어 이름은 같은 블로그의 해당 언어 글 제목에 있을 때만 쓴다.
 * 점포 고유명은 출처 표기를 유지하고, 나머지 정보는 원문 사실만 번역한다.
 */
export function formatKrwPrice(amount: number, locale: Locale): string {
  const formatted = amount.toLocaleString("ko-KR");
  return locale === "ko" ? `${formatted}원` : `₩${formatted}`;
}

/** ZH names for stores whose source has none (translated, not from the blog). */
const ZH_NAME_FALLBACK: Readonly<Record<string, string>> = { "worldcup-market-01": "夫妇蔬菜" };

export function localizeStoreName(store: WorldCupMarketStore, locale: Locale): string {
  if (locale === "en") return store.nameEn ?? store.nameKo;
  if (locale === "zh") return store.nameZh ?? ZH_NAME_FALLBACK[store.id] ?? store.nameKo;
  // JA: katakana transliteration of the Korean name (no official Japanese names exist).
  if (locale === "ja") return WORLD_CUP_MARKET_NAME_READINGS[store.id] ?? store.nameKo;
  return store.nameKo;
}

/**
 * JA shows the katakana transliteration as the store name (localizeStoreName);
 * the original Hangul name is shown alongside so a visitor can match the
 * physical signage. Other locales show nothing extra.
 */
export function getStoreNameReading(store: WorldCupMarketStore, locale: Locale): string | null {
  if (locale !== "ja") return null;
  return WORLD_CUP_MARKET_NAME_READINGS[store.id] ? store.nameKo : null;
}

type TranslatedCopy = Readonly<Record<string, Readonly<Record<Exclude<Locale, "ko">, string>>>>;

function translateSource(source: string | null, locale: Locale, copy: TranslatedCopy): string | null {
  if (source === null || locale === "ko") return source;
  if (source === "미확인") return getWorldCupMarketUiText(locale).unknown;
  // Preserve future source text if it has not yet been translated. Coverage tests
  // require translations for every current store instead of silently hiding gaps.
  return copy[source]?.[locale] ?? source;
}

// Category badges and filters are UI labels. Keep their data keys unchanged so
// filtering still uses the official source categories without inventing groups.
const CATEGORY_LABELS: Record<string, Record<Exclude<Locale, "ko">, string>> = {
  "채소": { en: "Vegetables", ja: "野菜", zh: "蔬菜" },
  // 블로그가 "채소"와 "야채"를 섞어 쓴다. 같은 뜻이라 번역도 같게 한다.
  "야채": { en: "Vegetables", ja: "野菜", zh: "蔬菜" },
  "과일": { en: "Fruit", ja: "果物", zh: "水果" },
  "정육": { en: "Meat", ja: "精肉", zh: "鲜肉" },
  "수산물": { en: "Seafood", ja: "水産物", zh: "水产品" },
  "건어물": { en: "Dried seafood", ja: "乾物", zh: "水产干货" },
  "생닭·오리": { en: "Chicken & duck", ja: "鶏肉・鴨肉", zh: "鸡肉·鸭肉" },
  "반찬": { en: "Side dishes", ja: "惣菜", zh: "小菜" },
  "떡": { en: "Rice cakes", ja: "韓国餅", zh: "韩式年糕" },
  "김": { en: "Seaweed", ja: "海苔", zh: "海苔" },
  "기름": { en: "Cooking oil", ja: "食用油", zh: "食用油" },
  "방앗간": { en: "Mill", ja: "製粉所", zh: "磨坊" },
  "식자재": { en: "Food ingredients", ja: "食材", zh: "食材" },
  "특산물": { en: "Regional specialties", ja: "特産品", zh: "特产" },
  "게장": { en: "Marinated crab", ja: "ケジャン", zh: "酱蟹" },
  "곱창": { en: "Gopchang (intestines)", ja: "コプチャン（ホルモン）", zh: "肥肠" },
  "국밥": { en: "Soup with rice", ja: "クッパ", zh: "汤饭" },
  "부대찌개": { en: "Budae jjigae", ja: "プデチゲ", zh: "部队锅" },
  "족발": { en: "Jokbal", ja: "チョッパル", zh: "猪蹄" },
  "시래기": { en: "Dried radish greens", ja: "干し大根の葉", zh: "干萝卜叶" },
  "전·순대": { en: "Jeon & sundae", ja: "チヂミ・スンデ", zh: "煎饼·米肠" },
  "어묵": { en: "Fish cakes", ja: "練り物", zh: "鱼饼" },
  "버블호떡": { en: "Bubble hotteok", ja: "バブルホットク", zh: "泡泡糖饼" },
  "주전부리": { en: "Snacks", ja: "おやつ", zh: "零食" },
  "생활용품": { en: "Household goods", ja: "生活用品", zh: "生活用品" },
  "신발": { en: "Shoes", ja: "靴", zh: "鞋" },
  "악세사리": { en: "Accessories", ja: "アクセサリー", zh: "饰品" },
  "여성의류·신발": { en: "Women's clothing & shoes", ja: "婦人服・靴", zh: "女装·鞋" },
  "이불": { en: "Quilts", ja: "布団", zh: "被褥" },
  "침구": { en: "Bedding", ja: "寝具", zh: "寝具" },
  "커튼": { en: "Curtains", ja: "カーテン", zh: "窗帘" },
  "장판·벽지": { en: "Flooring & wallpaper", ja: "床材・壁紙", zh: "地板·壁纸" },
};

const CATEGORY_GROUP_LABELS: Record<WorldCupMarketCategoryGroup, Record<Locale, string>> = {
  produce: { ko: "채소·과일", en: "Produce", ja: "野菜・果物", zh: "蔬菜·水果" },
  seafood: { ko: "수산·건어물", en: "Seafood & dried", ja: "水産・乾物", zh: "水产·干货" },
  meat: { ko: "정육·족발", en: "Meat & jokbal", ja: "精肉・チョッパル", zh: "肉类·猪蹄" },
  snacks: { ko: "분식·반찬·떡", en: "Snacks, sides & rice cakes", ja: "軽食・惣菜・餅", zh: "小吃·小菜·年糕" },
  restaurant: { ko: "음식점", en: "Restaurants", ja: "飲食店", zh: "餐馆" },
  pantry: { ko: "식재료·방앗간", en: "Pantry & mill", ja: "食材・製粉所", zh: "食材·磨坊" },
  living: { ko: "생활·의류", en: "Home & clothing", ja: "生活用品・衣料", zh: "生活·服饰" },
};

export function localizeCategoryGroup(group: WorldCupMarketCategoryGroup, locale: Locale): string {
  return CATEGORY_GROUP_LABELS[group][locale];
}

export function localizeCategory(category: string, locale: Locale): string {
  if (category === "미확인") return getWorldCupMarketUiText(locale).unknown;
  return locale === "ko" ? category : CATEGORY_LABELS[category]?.[locale] ?? category;
}

export function localizeDescription(description: string | null, locale: Locale): string | null {
  return translateSource(description, locale, WORLD_CUP_MARKET_DESCRIPTIONS);
}

export function localizeHours(hours: string | null, locale: Locale): string | null {
  return translateSource(hours, locale, DETAIL_HOURS_COPY);
}

export function localizeOrderNote(note: string | null, locale: Locale): string | null {
  return translateSource(note, locale, DETAIL_ORDER_COPY);
}

export function localizeProductName(name: string, locale: Locale): string {
  return translateSource(name, locale, DETAIL_PRODUCT_COPY) ?? name;
}

export function localizePriceLabel(label: string | null, locale: Locale): string | null {
  return translateSource(label, locale, DETAIL_PRICE_COPY);
}

export function localizeAddress(address: string, locale: Locale): string {
  return translateSource(address, locale, DETAIL_ADDRESS_COPY) ?? address;
}

export function localizeProduct(product: StoreProduct, locale: Locale): StoreProduct {
  if (locale === "ko") return product;
  return { ...product, nameKo: localizeProductName(product.nameKo, locale) };
}
