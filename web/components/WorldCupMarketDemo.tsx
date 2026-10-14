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
type DemoScreen = "map" | "detail" | "nearby";

const LOCALE_LABELS: Record<Locale, string> = { ko: "한국어", en: "English", ja: "日本語", zh: "中文" };

function walkLabel(locale: Locale, ui: ReturnType<typeof getWorldCupMarketUiText>): string {
  return locale === "ko" ? ui.goThere : ui.startWalkingGuide;
}

function priceText(price: number | null, priceLabel: string | null, locale: Locale): string | null {
  if (price !== null) return formatKrwPrice(price, locale);
  return localizePriceLabel(priceLabel, locale);
}

/** 상세 화면에서 값이 없어 숨긴 항목 이름. 한 줄로 모아 작게 보여준다. */
function missingStoreFields(store: WorldCupMarketStore, locale: Locale): string[] {
  const ui = getWorldCupMarketUiText(locale);
  const signature = representativeFact(store);
  const missing: string[] = [];
  if (!signature.name) missing.push(ui.representativeMenu);
  if (priceText(signature.price, signature.priceLabel, locale) === null) missing.push(ui.price);
  if (!localizeHours(store.businessHours, locale)) missing.push(ui.hours);
  if (parseStorePhones(store.phone).length === 0) missing.push(ui.phone);
  if (store.purchaseInfo.takeout === null) missing.push(ui.takeout);
  if (store.purchaseInfo.dineIn === null) missing.push(ui.dineIn);
  return missing;
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
  const screen: DemoScreen = params.get("view") === "nearby" ? "nearby" : "detail";
  return { screen, storeId: requestedStore };
}

function buildMarketUrl(storeId: string | null, nearby: boolean): string {
  const url = new URL(window.location.href);
  if (storeId) url.searchParams.set("store", storeId);
  else url.searchParams.delete("store");
  if (nearby) url.searchParams.set("view", "nearby");
  else url.searchParams.delete("view");
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Updates the store param in place (no new history entry); keeps the current map/nearby view. */
function updateStoreDeepLink(storeId: string | null): void {
  if (typeof window === "undefined") return;
  const nearby = new URLSearchParams(window.location.search).get("view") === "nearby";
  window.history.replaceState(window.history.state, "", buildMarketUrl(storeId, nearby));
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
        <strong>{ui.serviceName}</strong>
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
  const missing = missingStoreFields(store, locale);
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
      {missing.length > 0 ? (
        <p className="worldcup-market-not-confirmed"><span>{ui.notConfirmedFields}</span> {missing.join(" · ")}</p>
      ) : null}
    </section>
  );
}

function StoreNameReading({ store, locale }: { readonly store: WorldCupMarketStore; readonly locale: Locale }) {
  const reading = getStoreNameReading(store, locale);
  if (!reading) return null;
  return <small className="worldcup-market-name-reading">{reading}</small>;
}

function StoreDetail({ store, locale, onStartWalking, onOpenNearby }: {
  readonly store: WorldCupMarketStore;
  readonly locale: Locale;
  readonly onStartWalking: WorldCupMarketDemoProps["onStartWalking"];
  readonly onOpenNearby: () => void;
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
          <img className="worldcup-market-hero-backdrop" src={image.url} alt="" aria-hidden="true" />
          <img className="worldcup-market-hero-photo" src={image.url} alt={`${name} ${ui.shopPhoto}`} loading="eager" />
        </> : <div className="worldcup-market-store-image-fallback" role="img" aria-label={`${name} ${ui.aboutShop}`}><span>{localizeCategory(store.category, locale)}</span></div>}
      </div>
      <div className="worldcup-market-mobile-detail-body">
        <h2 id="worldcup-market-selected-title">{name}</h2>
        <StoreNameReading store={store} locale={locale} />
        <p className="worldcup-market-mobile-category">{localizeCategory(store.category, locale)}</p>
        {getWorldCupMarketMapPlacement(store.id)?.approximate ? <small className="worldcup-market-approximate">{ui.approximateLocation}</small> : null}
        {localizeDescription(store.descriptionKo, locale) ? <p className="worldcup-market-mobile-description">{localizeDescription(store.descriptionKo, locale)}</p> : null}
        {locale !== "ko" ? <p className="worldcup-market-source-notice">{ui.originalSourceNotice}</p> : null}
        <StoreKeyFacts store={store} locale={locale} />
        <StorePrimaryActions store={store} locale={locale} onStartWalking={onStartWalking} />
      </div>
      <MenuCarousel store={store} locale={locale} />
      <StoreAbout store={store} locale={locale} />
      <div className="worldcup-market-nearby-entry">
        <button type="button" onClick={onOpenNearby}>
          <span>{ui.nearbyEntry}</span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </article>
  );
}

function NearbyShopRail({ selectedId, locale, onSelect }: {
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
      {WORLD_CUP_MARKET_STORES.map((store) => {
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
              {image ? <img src={image.url} alt="" /> : <span className="worldcup-market-nearby-thumb-fallback" aria-hidden="true" />}
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

function NearbyScreen({ store, selectedId, locale, onLocaleChange, onSelect, onBack, onStartWalking }: {
  readonly store: WorldCupMarketStore;
  readonly selectedId: string;
  readonly locale: Locale;
  readonly onLocaleChange?: ((locale: Locale) => void) | undefined;
  readonly onSelect: (storeId: string) => void;
  readonly onBack: () => void;
  readonly onStartWalking: WorldCupMarketDemoProps["onStartWalking"];
}) {
  const ui = getWorldCupMarketUiText(locale);
  const image = store.storeImages[0];

  const sharedLocationCount = store.storeLocation
    ? WORLD_CUP_MARKET_STORES.filter((item) => item.storeLocation
      && item.storeLocation.latitude === store.storeLocation?.latitude
      && item.storeLocation.longitude === store.storeLocation?.longitude).length
    : 0;

  return (
    <section className="worldcup-market-nearby-screen" aria-labelledby="worldcup-market-nearby-title">
      <WorldCupMarketMobileHeader locale={locale} onLocaleChange={onLocaleChange} onBack={onBack} />
      <div className="worldcup-market-nearby-heading">
        <p>{ui.nearbyEyebrow}</p>
        <h2 id="worldcup-market-nearby-title">{ui.nearbyTitle}</h2>
        {locale !== "ko" ? <p className="worldcup-market-source-notice">{ui.originalSourceNotice}</p> : null}
      </div>
      <NearbyShopRail selectedId={selectedId} locale={locale} onSelect={onSelect} />

      <article className="worldcup-market-nearby-selected">
        {image ? <img src={image.url} alt="" /> : null}
        <div>
          <h3>{localizeStoreName(store, locale)}</h3>
          <StoreNameReading store={store} locale={locale} />
          <p>{localizeCategory(store.category, locale)}</p>
          <span>{localizeDescription(store.descriptionKo, locale) ?? ui.unknown}</span>
        </div>
      </article>

      <section className="worldcup-market-nearby-block" aria-labelledby="worldcup-market-storefront-title">
        <div className="worldcup-market-nearby-block-heading">
          <h3 id="worldcup-market-storefront-title">{ui.storefrontTitle}</h3>
          <span>{store.streetView.provider === "NAVER" ? "NAVER Panorama" : "Google Street View"}</span>
        </div>
        <WorldCupMarketStreetView key={`storefront-${store.id}`} store={store} locale={locale} />
      </section>

      <section className="worldcup-market-nearby-block" aria-labelledby="worldcup-market-location-map-title">
        <div className="worldcup-market-nearby-block-heading">
          <h3 id="worldcup-market-location-map-title">{ui.locationTitle}</h3>
          <span>{ui.market}</span>
        </div>
        <p>{localizeAddress(store.address, locale)}</p>
        {getWorldCupMarketMapPlacement(store.id)?.approximate ? <small className="worldcup-market-approximate">{ui.approximateLocation}</small> : null}
        {sharedLocationCount > 1 ? (
          <p role="note">{ui.sharedLocationNotice.replace("{count}", String(sharedLocationCount))}</p>
        ) : null}
        {!store.storeLocation && WORLD_CUP_MARKET_STORES.some((item) => item.storeLocation) ? (
          <p role="status">{ui.locationTitle}: {ui.unknown}</p>
        ) : null}
        {WORLD_CUP_MARKET_STORES.some((item) => item.storeLocation) ? (
          worldCupMarketLiveMapEnabled()
            ? <WorldCupMarketMap stores={WORLD_CUP_MARKET_STORES} selectedId={selectedId} here={null} onSelect={onSelect} locale={locale} mode="detail" />
            : <WorldCupMarketStaticMap stores={WORLD_CUP_MARKET_STORES} selectedId={selectedId} onSelect={(storeId) => { track("map_pin_click", { storeId, locale, src: "detail" }); onSelect(storeId); }} locale={locale} mode="detail" />
        ) : (
          <p role="status">{ui.unknown}</p>
        )}
      </section>

      {worldCupMarketWalkingEnabled() ? <div className="worldcup-market-nearby-cta">
        <button type="button" disabled={store.navigationTarget === null}
        onClick={() => {
          const coordinate = store.navigationTarget;
          if (!coordinate) return;
          track("directions", { storeId: store.id, locale });
          onStartWalking({ name: localizeStoreName(store, locale), coordinate });
        }}>
          {walkLabel(locale, ui)}
        </button>
      </div> : null}
    </section>
  );
}

function MarketOverview({ locale, onSelect, onPinSelect }: {
  readonly locale: Locale;
  readonly onSelect: (storeId: string) => void;
  readonly onPinSelect: (storeId: string) => void;
}) {
  const ui = getWorldCupMarketUiText(locale);
  const [group, setGroup] = useState<WorldCupMarketCategoryGroup | null>(null);
  const groups = useMemo(() => WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER.filter((item) =>
    WORLD_CUP_MARKET_STORES.some((store) => store.categoryGroup === item)), []);
  const stores = useMemo(() => WORLD_CUP_MARKET_STORES.filter((store) => group === null || store.categoryGroup === group), [group]);
  return (
    <div className={`worldcup-market-overview${worldCupMarketLiveMapEnabled() ? "" : " has-floor"}`}>
      <div className="worldcup-market-overview-heading">
        <h1>{ui.market}</h1>
        <p>{ui.subtitle}</p>
      </div>
      <div className="worldcup-market-category-filter" role="group" aria-label={ui.categoryFilter}>
        <button type="button" aria-pressed={group === null} onClick={() => setGroup(null)}>{ui.allCategories}</button>
        {groups.map((item) => <button type="button" key={item} aria-pressed={group === item} onClick={() => setGroup(item)}>{localizeCategoryGroup(item, locale)}</button>)}
      </div>
      <div className="worldcup-market-overview-map">
        {worldCupMarketLiveMapEnabled()
          ? <WorldCupMarketMap stores={stores} selectedId="" here={null} onSelect={onPinSelect} locale={locale} mode="overview" />
          : <WorldCupMarketFloorMap stores={stores} onSelect={onPinSelect} locale={locale} />}
      </div>
      <section className="worldcup-market-overview-list" aria-labelledby="worldcup-market-list-title">
        <div className="worldcup-market-section-heading">
          <h2 id="worldcup-market-list-title">{ui.storeList}</h2>
          <span role="status">{ui.storesCount(stores.length)}</span>
        </div>
        <ul className="wcm-index" aria-label={ui.storeList}>
          {[...stores].sort((a, b) => (a.corridorOrder ?? 999) - (b.corridorOrder ?? 999)).map((store) => {
            const g = store.categoryGroup ?? "unknown";
            return <li key={store.id}>
              <button type="button" onClick={() => onSelect(store.id)}>
                <span className="wcm-index-badge" style={{ background: FLOOR_MAP_COLORS[g].strong }}>{store.corridorOrder}</span>
                <span>
                  <strong>{localizeStoreName(store, locale)}</strong>
                </span>
              </button>
            </li>;
          })}
        </ul>
      </section>
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

  const openNearby = useCallback(() => {
    window.history.pushState(null, "", buildMarketUrl(selectedId, true));
    setScreenName("nearby");
  }, [selectedId]);

  const closeNearby = useCallback(() => {
    setScreenName("detail");
    window.history.replaceState(null, "", buildMarketUrl(selectedId, false));
  }, [selectedId]);

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

  if (screenName === "nearby") {
    return (
      <section className="worldcup-market-demo worldcup-market-mobile-screen" lang={htmlLangFor(locale)} aria-label={getWorldCupMarketUiText(locale).title}>
        <NearbyScreen
          store={selected}
          selectedId={selectedId}
          locale={locale}
          onLocaleChange={onLocaleChange}
          onSelect={(storeId) => {
            track("store_view", { storeId, locale, src: "nearby" });
            setSelectedId(storeId);
            updateStoreDeepLink(storeId);
          }}
          onBack={closeNearby}
          onStartWalking={onStartWalking}
        />
      </section>
    );
  }

  return (
    <section className="worldcup-market-demo worldcup-market-mobile-screen" lang={htmlLangFor(locale)} aria-labelledby="worldcup-market-demo-title">
      <WorldCupMarketMobileHeader locale={locale} onLocaleChange={onLocaleChange} onBack={backToMap} backLabel={ui.backToMap} />
      <h1 id="worldcup-market-demo-title" className="visually-hidden">{ui.title}</h1>
      <StoreDetail key={selected.id} store={selected} locale={locale} onStartWalking={onStartWalking} onOpenNearby={openNearby} />
      <StoreSwitcher stores={WORLD_CUP_MARKET_STORES} selectedId={selectedId} locale={locale} onSelect={selectStore} />
    </section>
  );
}
