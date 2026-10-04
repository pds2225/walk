import type { Locale } from "./i18n";
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

export function localizeCategory(category: string, locale: Locale): string {
  return keepSource(locale, category);
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
