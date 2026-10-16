"use client";
import { track } from "../lib/track";
import { useDetailFunnel } from "../lib/useDetailFunnel";
import type { StoreViewSource } from "../lib/funnelEvents";

// Store details and nearby views reflect verified location availability.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getWorldCupMarketUiText, LOCALE_OPTIONS, type Locale } from "../lib/i18n";
import {
  formatKrwPrice,
  getStoreNameReading,
  localizeAddress,
  localizeCategory,
  localizeCategoryGroup,
  localizeDescription,
  localizeHours,
  localizeOrderNote,
  localizePriceLabel,
  localizeProductName,
  localizeStoreName,
} from "../lib/worldCupMarketStoreCopy";
import {
  WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER,
  WORLD_CUP_MARKET_STORES,
  type StoreProduct,
  type WorldCupMarketCategoryGroup,
  type WorldCupMarketStore,
} from "../lib/worldCupMarketStores";
import type { Coordinate } from "../lib/types";
import WorldCupMarketStreetView from "./WorldCupMarketStreetView";
import { getWorldCupMarketMapPlacement } from "../lib/worldCupMarketMapLayout";
import { worldCupMarketLiveMapEnabled, worldCupMarketWalkingEnabled } from "../lib/worldCupMarketFeatures";
import { parseStorePhones } from "../lib/worldCupMarketPhone";
import { htmlLangFor } from "../lib/localePreference";
import WorldCupMarketStaticMap from "./WorldCupMarketStaticMap";
import WorldCupMarketFloorMap from "./WorldCupMarketFloorMap";
import { FLOOR_MAP_COLORS } from "../lib/worldCupMarketFloorMap";

// The NAVER SDK is loaded only in the browser.
const WorldCupMarketMap = dynamic(() => import("./WorldCupMarketMap"), { ssr: false });

interface WorldCupMarketDemoProps {
  readonly locale: Locale;
  readonly onLocaleChange?: (locale: Locale) => void;
  readonly onStartWalking: (target: { name: string; coordinate: Coordinate }) => void;
}

type DisplayProduct = StoreProduct;
type DemoScreen = "map" | "detail";

const VIEW_DETAIL: Record<Locale, string> = { ko: "상세 보기", en: "Details", ja: "詳細を見る", zh: "查看详情" };
const LOCALE_LABELS: Record<Locale, string> = { ko: "한국어", en: "English", ja: "日本語", zh: "中文" };

function walkLabel(locale: Locale, ui: ReturnType<typeof getWorldCupMarketUiText>): string {
  return locale === "ko" ? ui.goThere : ui.startWalkingGuide;
}

function priceText(price: number | null, priceLabel: string | null, locale: Locale): string | null {
  if (price !== null) return formatKrwPrice(price, locale);
  return localizePriceLabel(priceLabel, locale);
}

function displayProducts(store: WorldCupMarketStore): DisplayProduct[] {
  const products = [...store.products];
  const representative = store.representativeMenu;
  if (representative && !products.some((product) => product.nameKo === representative.nameKo)) {
    products.unshift({
      nameKo: representative.nameKo,
      priceKrw: representative.priceWon,
      priceLabel: null,
      descriptionKo: null,
    });
  }
  return products;
}

function hasStore(storeId: string | null): storeId is string {
  return Boolean(storeId && WORLD_CUP_MARKET_STORES.some((store) => store.id === storeId));
}

function screenFromSearch(search: string): { readonly screen: DemoScreen; readonly storeId: string | null } {
  const params = new URLSearchParams(search);
  const requestedStore = params.get("store");
  if (!hasStore(requestedStore)) return { screen: "map", storeId: null };
  // Old ?view=nearby links land on the single merged detail page.
  return { screen: "detail", storeId: requestedStore };
}

function buildMarketUrl(storeId: string | null, nearby: boolean): string {
  const url = new URL(window.location.href);
  if (storeId) url.searchParams.set("store", storeId);
  else url.searchParams.delete("store");
  if (nearby) url.searchParams.set("view", "nearby");
  else url.searchParams.delete("view");
  return `${url.pathname}${url.search}${url.hash}`;
}

function WorldCupMarketMobileHeader({ locale, onLocaleChange, onBack, backLabel }: {
  readonly locale: Locale;
  readonly onLocaleChange?: ((locale: Locale) => void) | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly backLabel?: string;
}) {
  const ui = getWorldCupMarketUiText(locale);
  const goBack = () => onBack?.();

  return (
    <header className="worldcup-market-mobile-header">
      {/* The market map is the K-Trip main screen: no back button there, so it can't
          navigate away (history.back() used to leave the market entirely). */}
      {onBack ? <button type="button" className="worldcup-market-back-button" aria-label={backLabel ?? ui.back} onClick={goBack}>‹</button> : null}
      <div className="worldcup-market-mobile-brand">
        <a href={`/worldcup-market?lang=${locale}`} aria-label={`${ui.serviceName} · ${ui.market}`}><strong>{ui.serviceName}</strong></a>
      </div>
      <p className="worldcup-market-header-title">{ui.market}</p>
      <div className="worldcup-market-locale-switcher" role="group" aria-label={ui.chooseLanguage}>
        <span className="worldcup-market-globe" aria-hidden="true">🌐</span>
        {LOCALE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={locale === option.value ? "is-active" : ""}
            aria-pressed={locale === option.value}
            lang={option.value === "zh" ? "zh-CN" : option.value}
            onClick={() => onLocaleChange?.(option.value)}
          >
            {LOCALE_LABELS[option.value]}
          </button>
        ))}
      </div>
    </header>
  );
}

function StoreSwitcher({ stores, selectedId, locale, onSelect }: {
  readonly stores: readonly WorldCupMarketStore[];
  readonly selectedId: string;
  readonly locale: Locale;
  readonly onSelect: (storeId: string) => void;
}) {
  const ui = getWorldCupMarketUiText(locale);
  return (
    <nav className="worldcup-market-store-switcher" aria-label={ui.selectShop}>
      {stores.map((store) => (
        <button
          key={store.id}
          type="button"
          className={store.id === selectedId ? "is-active" : ""}
          aria-current={store.id === selectedId ? "true" : undefined}
          onClick={() => onSelect(store.id)}
        >
          {localizeStoreName(store, locale)}
        </button>
      ))}
    </nav>
  );
}

function representativeFact(store: WorldCupMarketStore): { name: string; price: number | null; priceLabel: string | null } {
  const menu = store.representativeMenu;
  if (menu) {
    // A null menu price is unverified. Do not borrow another product's price.
    return { name: menu.nameKo, price: menu.priceWon, priceLabel: null };
  }
  const firstProduct = store.products[0];
  return {
    name: firstProduct?.nameKo ?? "",
    price: firstProduct?.priceKrw ?? null,
    priceLabel: firstProduct?.priceLabel ?? null,
  };
}

function StoreKeyFacts({ store, locale }: { readonly store: WorldCupMarketStore; readonly locale: Locale }) {
  const ui = getWorldCupMarketUiText(locale);
  const signature = representativeFact(store);
  const price = priceText(signature.price, signature.priceLabel, locale);
  const hours = localizeHours(store.businessHours, locale);
  // Unknown values are hidden here and listed once in StoreAbout's "not confirmed" line.
  const facts = [
    signature.name ? { key: "menu", icon: "✦", label: ui.representativeMenu, value: localizeProductName(signature.name, locale) } : null,
    price ? { key: "price", icon: "₩", label: ui.price, value: price } : null,
    hours ? { key: "hours", icon: "◷", label: ui.hours, value: hours } : null,
  ].filter((fact): fact is { key: string; icon: string; label: string; value: string } => fact !== null);
  if (facts.length === 0) return null;
  return (
    <dl className="worldcup-market-mobile-key-facts" data-count={facts.length}>
      {facts.map((fact) => (
        <div key={fact.key} data-fact={fact.key}>
          <dt><span aria-hidden="true">{fact.icon}</span>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StorePrimaryActions({ store, locale, onStartWalking }: {
  readonly store: WorldCupMarketStore;
  readonly locale: Locale;
  readonly onStartWalking: WorldCupMarketDemoProps["onStartWalking"];
}) {
  // Save/share were removed (Dasom review 2026-10-12): no visible saved list, and
  // share was unreliable. Only the walking CTA remains, and it is flag-gated.
  if (!worldCupMarketWalkingEnabled()) return null;
  const ui = getWorldCupMarketUiText(locale);
  return (
    <div className="worldcup-market-mobile-actions">
      <button
        type="button"
        className="worldcup-market-mobile-primary"
        disabled={store.navigationTarget === null}
        onClick={() => {
          const coordinate = store.navigationTarget;
          if (!coordinate) return;
          track("directions", { storeId: store.id, locale });
          onStartWalking({ name: localizeStoreName(store, locale), coordinate });
        }}
      >
        {walkLabel(locale, ui)}
      </button>
    </div>
  );
}

function MenuCarousel({ store, locale }: { readonly store: WorldCupMarketStore; readonly locale: Locale }) {
  const ui = getWorldCupMarketUiText(locale);
  const [expanded, setExpanded] = useState(false);
  const products = useMemo(() => displayProducts(store), [store]);
  const shownProducts = expanded ? products : products.slice(0, 6);
  if (products.length === 0) return null;

  return (
    <section className="worldcup-market-mobile-section worldcup-market-popular-menu" aria-labelledby="worldcup-market-popular-menu-title">
      <div className="worldcup-market-section-heading">
        <h3 id="worldcup-market-popular-menu-title">{ui.popularMenu}</h3>
        {products.length > 6 ? (
          <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? ui.showLess : ui.seeAll}</button>
        ) : null}
      </div>
      {(
        <div className="worldcup-market-menu-carousel" role="region" aria-label={ui.popularMenu}>
          {shownProducts.map((product) => {
            const signature = store.representativeMenu?.nameKo === product.nameKo;
            return (
              <article key={`${store.id}-${product.nameKo}`} className="worldcup-market-menu-card">
                {signature ? <span className="worldcup-market-signature">{ui.signature}</span> : null}
                <strong>{localizeProductName(product.nameKo, locale)}</strong>
                {priceText(product.priceKrw, product.priceLabel, locale) ? <span>{priceText(product.priceKrw, product.priceLabel, locale)}</span> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function purchaseText(value: boolean | null, ui: ReturnType<typeof getWorldCupMarketUiText>): string {
  if (value === null) return ui.unavailable;
  return value ? ui.available : ui.notAvailable;
}

function StoreAbout({ store, locale }: { readonly store: WorldCupMarketStore; readonly locale: Locale }) {
  const ui = getWorldCupMarketUiText(locale);
  const orderNote = localizeOrderNote(store.purchaseInfo.orderNote, locale);
  const phones = parseStorePhones(store.phone);
  const purchase = [
    store.purchaseInfo.takeout === null ? null : { key: "takeout", label: ui.takeout, value: store.purchaseInfo.takeout },
    store.purchaseInfo.dineIn === null ? null : { key: "dineIn", label: ui.dineIn, value: store.purchaseInfo.dineIn },
  ].filter((item): item is { key: string; label: string; value: boolean } => item !== null);
  // The description is shown once, at the top of the detail screen.
  return (
    <section className="worldcup-market-mobile-section worldcup-market-about-shop" aria-labelledby="worldcup-market-about-shop-title">
      <h3 id="worldcup-market-about-shop-title">{ui.aboutShop}</h3>
      <p>{localizeAddress(store.address, locale)}</p>
      {phones.length > 0 ? (
        <p className="worldcup-market-phone">
          <span>{ui.phone}</span>
          {phones.map((phone) => <a key={phone.href} href={phone.href} onClick={() => track("phone_click", { storeId: store.id, locale })}>{phone.label}</a>)}
        </p>
      ) : null}
      {purchase.length > 0 ? (
        <dl className="worldcup-market-purchase-facts">
          {purchase.map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{purchaseText(item.value, ui)}</dd></div>)}
        </dl>
      ) : null}
      {orderNote ? <p className="worldcup-market-order-note"><strong>{ui.orderNote}</strong>{orderNote}</p> : null}
    </section>
  );
}

function StoreNameReading({ store, locale }: { readonly store: WorldCupMarketStore; readonly locale: Locale }) {
  const reading = getStoreNameReading(store, locale);
  if (!reading) return null;
  return <small className="worldcup-market-name-reading">{reading}</small>;
}

function StoreDetail({ store, locale, onStartWalking, onSelect }: {
  readonly store: WorldCupMarketStore;
  readonly locale: Locale;
  readonly onStartWalking: WorldCupMarketDemoProps["onStartWalking"];
  readonly onSelect: (storeId: string) => void;
}) {
  const ui = getWorldCupMarketUiText(locale);
  const image = store.storeImages[0];
  const name = localizeStoreName(store, locale);
  const detailRef = useRef<HTMLElement | null>(null);
  useDetailFunnel(store.id, locale, detailRef);
  return (
    <article ref={detailRef} className="worldcup-market-mobile-detail" aria-labelledby="worldcup-market-selected-title">
      <div className="worldcup-market-mobile-hero-image">
        {image ? <>
          <span className="wcm-photo-crop is-hero"><img className="worldcup-market-hero-photo" src={image.url} alt={`${name} ${ui.shopPhoto}`} loading="eager" /></span>
        </> : <div className="worldcup-market-store-image-fallback" role="img" aria-label={`${name} ${ui.aboutShop}`}><span>{localizeCategory(store.category, locale)}</span></div>}
      </div>
      <div className="worldcup-market-mobile-detail-body">
        <h2 id="worldcup-market-selected-title">{name}</h2>
        <StoreNameReading store={store} locale={locale} />
        <p className="worldcup-market-mobile-category">{localizeCategory(store.category, locale)}</p>
        {localizeDescription(store.descriptionKo, locale) ? <p className="worldcup-market-mobile-description">{localizeDescription(store.descriptionKo, locale)}</p> : null}
        {locale !== "ko" ? <p className="worldcup-market-source-notice">{ui.originalSourceNotice}</p> : null}
        <StoreKeyFacts store={store} locale={locale} />
        <StorePrimaryActions store={store} locale={locale} onStartWalking={onStartWalking} />
      </div>
      <MenuCarousel store={store} locale={locale} />
      <StoreAbout store={store} locale={locale} />
      <nav className="worldcup-market-mobile-section worldcup-market-detail-nearby" aria-label={ui.selectShop}>
        <h3>{ui.nearbyTitle}</h3>
        <NearbyShopRail selectedId={store.id} locale={locale} onSelect={onSelect} sortByDistance />
      </nav>
      <section className="worldcup-market-mobile-section worldcup-market-detail-location" aria-labelledby="worldcup-market-location-map-title">
        <h3 id="worldcup-market-location-map-title">{ui.locationTitle}</h3>
        <WorldCupMarketFloorMap stores={WORLD_CUP_MARKET_STORES} selectedId={store.id} locale={locale} variant="detail"
          onSelect={(storeId) => { track("map_pin_click", { storeId, locale, src: "detail" }); onSelect(storeId); }} />
      </section>
      <section className="worldcup-market-mobile-section worldcup-market-detail-storefront" aria-labelledby="worldcup-market-storefront-title">
        <h3 id="worldcup-market-storefront-title">{ui.storefrontTitle}</h3>
        <WorldCupMarketStreetView key={`storefront-${store.id}`} store={store} locale={locale} />
      </section>
    </article>
  );
}

/** All stores, nearest first (selected first), by the existing approximate display points. */
function storesByDistance(selectedId: string): readonly WorldCupMarketStore[] {
  const at = (id: string) => getWorldCupMarketMapPlacement(id)?.displayLocation ?? null;
  const o = at(selectedId);
  if (!o) return WORLD_CUP_MARKET_STORES;
  const d = (id: string) => { const p = at(id); return p ? Math.hypot(p.latitude - o.latitude, (p.longitude - o.longitude) * 0.79) : Infinity; };
  return [...WORLD_CUP_MARKET_STORES].sort((a, b) => d(a.id) - d(b.id));
}

function NearbyShopRail({ selectedId, locale, onSelect, sortByDistance = false }: {
  readonly sortByDistance?: boolean;
  readonly selectedId: string;
  readonly locale: Locale;
  readonly onSelect: (storeId: string) => void;
}) {
  const ui = getWorldCupMarketUiText(locale);
  const railRef = useRef<HTMLUListElement | null>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const updateEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setEdges({ start: rail.scrollLeft <= 2, end: max <= 2 || rail.scrollLeft >= max - 2 });
  }, []);
  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [updateEdges]);
  const scrollByPage = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy?.({ left: direction * Math.max(rail.clientWidth * 0.8, 140), behavior: "smooth" });
  };
  return (
    <div className="worldcup-market-nearby-rail-wrap" data-at-start={edges.start} data-at-end={edges.end}>
    {!edges.start ? <button type="button" className="worldcup-market-rail-arrow is-prev" aria-label={ui.railPrevious} onClick={() => scrollByPage(-1)}>‹</button> : null}
    {!edges.end ? <button type="button" className="worldcup-market-rail-arrow is-next" aria-label={ui.railNext} onClick={() => scrollByPage(1)}>›</button> : null}
    <ul ref={railRef} className="worldcup-market-nearby-rail" aria-label={ui.nearbyTitle} onScroll={updateEdges}>
      {(sortByDistance ? storesByDistance(selectedId) : WORLD_CUP_MARKET_STORES).map((store) => {
        const image = store.storeImages[0];
        const selected = store.id === selectedId;
        const name = localizeStoreName(store, locale);
        return (
          <li key={store.id} aria-label={name} onClick={() => onSelect(store.id)}>
            <button
              type="button"
              className={selected ? "is-selected" : ""}
              aria-pressed={selected}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(store.id);
              }}
            >
              {image ? <span className="wcm-photo-crop"><img src={image.url} alt="" /></span> : <span className="worldcup-market-nearby-thumb-fallback" aria-hidden="true" />}
              <strong>{name}</strong>
              <StoreNameReading store={store} locale={locale} />
              <small>{localizeCategory(store.category, locale)}</small>
            </button>
          </li>
        );
      })}
    </ul>
    </div>
  );
}

function MarketOverview({ locale, onSelect, onPinSelect }: {
  readonly locale: Locale;
  readonly onSelect: (storeId: string) => void;
  readonly onPinSelect: (storeId: string) => void;
}) {
  const ui = getWorldCupMarketUiText(locale);
  const [group, setGroup] = useState<WorldCupMarketCategoryGroup | null>(null);
  // List tap only marks the store on the full map (red; the my-location dot stays as is); tap again or "상세 보기" opens detail.
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (storeId: string) => {
    if (picked === storeId) { onSelect(storeId); return; }
    setPicked(storeId);
  };
  const groups = useMemo(() => WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER.filter((item) =>
    WORLD_CUP_MARKET_STORES.some((store) => store.categoryGroup === item)), []);
  const stores = useMemo(() => WORLD_CUP_MARKET_STORES.filter((store) => group === null || store.categoryGroup === group), [group]);
  // Filtered: the short list sits right under the chips, above the map. "All": full list stays below the map.
  const storeList = (
      <section className={`worldcup-market-overview-list${group === null ? "" : " is-filtered"}`} aria-labelledby="worldcup-market-list-title">
        <div className="worldcup-market-section-heading">
          <h2 id="worldcup-market-list-title">{ui.storeList}</h2>
          <span role="status">{ui.storesCount(stores.length)}</span>
        </div>
        <ul className="wcm-index" aria-label={ui.storeList}>
          {[...stores].sort((a, b) => (a.corridorOrder ?? 999) - (b.corridorOrder ?? 999)).map((store) => {
            const g = store.categoryGroup ?? "unknown";
            const isPicked = picked === store.id;
            return <li key={store.id} className={isPicked ? "is-picked" : undefined}>
              <button type="button" aria-pressed={isPicked} onClick={() => pick(store.id)}>
                <span className="wcm-index-badge" style={{ background: FLOOR_MAP_COLORS[g].strong }}>{store.corridorOrder}</span>
                <span>
                  <strong>{localizeStoreName(store, locale)}</strong>
                </span>
              </button>
              {isPicked ? <button type="button" className="wcm-index-detail" onClick={() => onSelect(store.id)}>{VIEW_DETAIL[locale]} ›</button> : null}
            </li>;
          })}
        </ul>
      </section>
  );
  return (
    <div className={`worldcup-market-overview${worldCupMarketLiveMapEnabled() ? "" : " has-floor"}`}>
      <div className="worldcup-market-overview-heading visually-hidden">
        <h1>{ui.market}</h1>
        <p>{ui.subtitle}</p>
      </div>
      <div className="worldcup-market-category-filter" role="group" aria-label={ui.categoryFilter}>
        <button type="button" aria-pressed={group === null} onClick={() => setGroup(null)}>{ui.allCategories}</button>
        {groups.map((item) => <button type="button" key={item} aria-pressed={group === item} onClick={() => setGroup(item)}><i aria-hidden="true" style={{ background: FLOOR_MAP_COLORS[item].strong }} />{localizeCategoryGroup(item, locale)}</button>)}
      </div>
      {storeList}
      <div className="worldcup-market-overview-map">
        {worldCupMarketLiveMapEnabled()
          ? <WorldCupMarketMap stores={stores} selectedId="" here={null} onSelect={onPinSelect} locale={locale} mode="overview" />
          : <WorldCupMarketFloorMap stores={WORLD_CUP_MARKET_STORES} onSelect={onPinSelect} locale={locale} selectedId={picked ?? ""}
              highlightIds={group === null ? null : new Set(stores.map((store) => store.id))} />}
      </div>
    </div>
  );
}

export default function WorldCupMarketDemo({ locale, onLocaleChange, onStartWalking }: WorldCupMarketDemoProps) {
  const [selectedId, setSelectedId] = useState(WORLD_CUP_MARKET_STORES[0]?.id ?? "");
  const [screenName, setScreenName] = useState<DemoScreen>("map");
  // Funnel events wait until the screen has been synced from the URL, so a
  // ?store= deep link does not log a page_view for the initial "map" state.
  const [urlSynced, setUrlSynced] = useState(false);
  const ui = getWorldCupMarketUiText(locale);
  const selected = WORLD_CUP_MARKET_STORES.find((store) => store.id === selectedId) ?? WORLD_CUP_MARKET_STORES[0];
  // Scroll position the list had right before opening a detail view, restored
  // when returning to the map (in-app back button or the browser/phone back
  // button). Consumed once so a later redundant popstate does not re-force it.
  const savedMapScrollRef = useRef<number | null>(null);
  // How the next store detail was opened; consumed by the store_view effect.
  const viewSourceRef = useRef<StoreViewSource>("deeplink");
  const localeRef = useRef(locale);
  localeRef.current = locale;

  useEffect(() => {
    if (!urlSynced) return;
    if (screenName === "map") {
      track("page_view", { locale: localeRef.current });
      return;
    }
    if (screenName === "detail") {
      track("store_view", { storeId: selectedId, locale: localeRef.current, src: viewSourceRef.current });
      viewSourceRef.current = "switcher";
    }
  }, [screenName, selectedId, urlSynced]);

  const restoreMapScrollIfNeeded = useCallback(() => {
    const top = savedMapScrollRef.current;
    if (top === null) return;
    savedMapScrollRef.current = null;
    window.scrollTo?.({ top });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncFromUrl = () => {
      const { screen, storeId } = screenFromSearch(window.location.search);
      if (storeId) setSelectedId(storeId);
      setScreenName(screen);
      if (screen === "map") restoreMapScrollIfNeeded();
    };
    syncFromUrl();
    setUrlSynced(true);
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [restoreMapScrollIfNeeded]);

  const selectStore = useCallback((storeId: string, source: StoreViewSource = "switcher") => {
    // Also used by the detail screen's store switcher to jump between
    // stores directly, so this only captures the map's scroll position when
    // actually leaving the map screen.
    if (!hasStore(storeId)) return;
    viewSourceRef.current = source;
    if (screenName === "map") savedMapScrollRef.current = window.scrollY;
    setSelectedId(storeId);
    setScreenName("detail");
    // Only leaving the map adds a history entry. Switching store to store from a
    // detail replaces it, so phone back from any detail returns to the map.
    if (screenName === "map") window.history.pushState(null, "", buildMarketUrl(storeId, false));
    else window.history.replaceState(null, "", buildMarketUrl(storeId, false));
    window.scrollTo?.({ top: 0 });
  }, [screenName]);

  // Always replaces rather than calling history.back(): the button must land
  // on the market list even from a direct "?store=" deep link with no map
  // entry behind it. The real browser/phone back button still works via the
  // pushState entries above and the popstate listener syncing from the URL.
  const backToMap = useCallback(() => {
    setScreenName("map");
    window.history.replaceState(null, "", buildMarketUrl(null, false));
    restoreMapScrollIfNeeded();
  }, [restoreMapScrollIfNeeded]);

  if (!selected) return null;

  if (screenName === "map") {
    return (
      <section className="worldcup-market-demo worldcup-market-mobile-screen" lang={htmlLangFor(locale)} aria-label={ui.title}>
        <WorldCupMarketMobileHeader locale={locale} onLocaleChange={onLocaleChange} />
        <MarketOverview
          locale={locale}
          onSelect={(storeId) => selectStore(storeId, "list")}
          onPinSelect={(storeId) => {
            track("map_pin_click", { storeId, locale, src: "overview" });
            selectStore(storeId, "map");
          }}
        />
      </section>
    );
  }

  return (
    <section className="worldcup-market-demo worldcup-market-mobile-screen" lang={htmlLangFor(locale)} aria-labelledby="worldcup-market-demo-title">
      <WorldCupMarketMobileHeader locale={locale} onLocaleChange={onLocaleChange} onBack={backToMap} backLabel={ui.backToMap} />
      <h1 id="worldcup-market-demo-title" className="visually-hidden">{ui.title}</h1>
      <StoreDetail key={selected.id} store={selected} locale={locale} onStartWalking={onStartWalking} onSelect={selectStore} />
    </section>
  );
}
