import { getWorldCupMarketUiText, type Locale } from "./i18n";
import type { StoreProduct, WorldCupMarketStore } from "./worldCupMarketStores";

/**
 * 화면 언어에 맞는 점포 표기.
 * 영어 이름과 중국어 이름은 같은 블로그의 해당 언어 글 제목에 있을 때만 쓴다.
 * 일본어 점포명과 메뉴·영업시간 번역은 블로그에 없으므로 한국어 원문을 유지한다.
 */
export function formatKrwPrice(amount: number, locale: Locale): string {
  const formatted = amount.toLocaleString("ko-KR");
  return locale === "ko" ? `${formatted}원` : `₩${formatted}`;
}

export function localizeStoreName(store: WorldCupMarketStore, locale: Locale): string {
  if (locale === "en") return store.nameEn ?? store.nameKo;
  if (locale === "zh") return store.nameZh ?? store.nameKo;
  return store.nameKo;
}

function keepSource<T extends string | null>(locale: Locale, source: T): T {
  if (locale === "ko" || locale === "en" || locale === "ja" || locale === "zh") return source;
  return source;
}

// Category badges and filters are UI labels. Keep their data keys unchanged so
// filtering still uses the official source categories without inventing groups.
const CATEGORY_LABELS: Record<string, Record<Exclude<Locale, "ko">, string>> = {
  "채소": { en: "Vegetables", ja: "野菜", zh: "蔬菜" },
  "야채": { en: "Vegetables (yachae)", ja: "野菜（ヤチェ）", zh: "蔬菜（Yachae）" },
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
  "곱창": { en: "Gopchang", ja: "コプチャン", zh: "烤肠" },
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

export function localizeCategory(category: string, locale: Locale): string {
  if (category === "미확인") return getWorldCupMarketUiText(locale).unknown;
  return locale === "ko" ? category : CATEGORY_LABELS[category]?.[locale] ?? category;
}

export function localizeDescription(description: string | null, locale: Locale): string | null {
  return keepSource(locale, description);
}

export function localizeHours(hours: string | null, locale: Locale): string | null {
  return keepSource(locale, hours);
}

export function localizeOrderNote(note: string | null, locale: Locale): string | null {
  return keepSource(locale, note);
}

export function localizeProductName(name: string, locale: Locale): string {
  return keepSource(locale, name);
}

export function localizePriceLabel(label: string | null, locale: Locale): string | null {
  return keepSource(locale, label);
}

export function localizeProduct(product: StoreProduct, locale: Locale): StoreProduct {
  if (locale === "ko") return product;
  return { ...product, nameKo: localizeProductName(product.nameKo, locale) };
}
