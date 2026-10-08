"use client";

// Store details and nearby views reflect verified location availability.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getWorldCupMarketUiText, LOCALE_OPTIONS, type Locale } from "../lib/i18n";
import {
  formatKrwPrice,
  localizeCategory,
  localizeDescription,
  localizeHours,
  localizeOrderNote,
  localizePriceLabel,
  localizeProductName,
  localizeStoreName,
} from "../lib/worldCupMarketStoreCopy";
import { WORLD_CUP_MARKET_STORES, type WorldCupMarketStore, type StoreProduct } from "../lib/worldCupMarketStores";
import type { Coordinate } from "../lib/types";
import WorldCupMarketStreetView from "./WorldCupMarketStreetView";
import { getWorldCupMarketMapPlacement } from "../lib/worldCupMarketMapLayout";
import { worldCupMarketWalkingEnabled } from "../lib/worldCupMarketFeatures";

// The NAVER SDK is loaded only in the browser.
const WorldCupMarketMap = dynamic(() => import("./WorldCupMarketMap"), { ssr: false });

interface WorldCupMarketDemoProps {
  readonly locale: Locale;
  readonly onLocaleChange?: (locale: Locale) => void;
  readonly onStartWalking: (target: { name: string; coordinate: Coordinate }) => void;
}

type ShareState = "idle" | "done" | "unavailable";
type DisplayProduct = StoreProduct;
type DemoScreen = "map" | "detail" | "nearby";

const LOCALE_CODES: Record<Locale, string> = { ko: "KO", en: "EN", ja: "JA", zh: "ZH" };

function walkLabel(locale: Locale, ui: ReturnType<typeof getWorldCupMarketUiText>): string {
  return locale === "ko" ? ui.goThere : ui.startWalkingGuide;
}

function priceText(
  price: number | null,
  priceLabel: string | null,
  locale: Locale,
  unknown: string,
): string {
  if (price !== null) return formatKrwPrice(price, locale);
  return localizePriceLabel(priceLabel, locale) ?? unknown;
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

function updateStoreDeepLink(storeId: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (storeId) url.searchParams.set("store", storeId);
  else url.searchParams.delete("store");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function WorldCupMarketMobileHeader({ locale, onLocaleChange, onBack, backLabel }: {
  readonly locale: Locale;
  readonly onLocaleChange?: ((locale: Locale) => void) | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly backLabel?: string;
}) {
  const ui = getWorldCupMarketUiText(locale);
  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
  };

  return (
    <header className="worldcup-market-mobile-header">
      <button type="button" className="worldcup-market-back-button" aria-label={backLabel ?? ui.back} onClick={goBack}>‹</button>
      <div className="worldcup-market-mobile-brand">
        <strong>{ui.serviceName}</strong>
        <span>{ui.market}</span>
      </div>
      <div className="worldcup-market-locale-switcher" role="group" aria-label={ui.chooseLanguage}>
        <span className="worldcup-market-globe" aria-hidden="true">🌐</span>
        {LOCALE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={locale === option.value ? "is-active" : ""}
            aria-pressed={locale === option.value}
            onClick={() => onLocaleChange?.(option.value)}
          >
            {LOCALE_CODES[option.value]}
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
  return (
    <dl className="worldcup-market-mobile-key-facts">
      <div>
        <dt><span aria-hidden="true">✦</span>{ui.representativeMenu}</dt>
        <dd>{localizeProductName(signature.name, locale) || ui.unknown}</dd>
      </div>
      <div>
        <dt><span aria-hidden="true">₩</span>{ui.price}</dt>
        <dd>{priceText(signature.price, signature.priceLabel, locale, ui.unknown)}</dd>
      </div>
      <div>
        <dt><span aria-hidden="true">◷</span>{ui.hours}</dt>
        <dd>{localizeHours(store.businessHours, locale) ?? ui.unknown}</dd>
      </div>
    </dl>
  );
}

function StorePrimaryActions({ store, locale, onStartWalking }: {
  readonly store: WorldCupMarketStore;
  readonly locale: Locale;
  readonly onStartWalking: WorldCupMarketDemoProps["onStartWalking"];
}) {
  const ui = getWorldCupMarketUiText(locale);
  const [saved, setSaved] = useState(false);
  const [shareState, setShareState] = useState<ShareState>("idle");

  const share = async () => {
    if (typeof navigator === "undefined") return;
    updateStoreDeepLink(store.id);
    const browserNavigator = navigator as Navigator & {
      share?: (data: { title: string; text: string; url: string }) => Promise<void>;
    };
    try {
      if (typeof browserNavigator.share === "function") {
        await browserNavigator.share({
          title: localizeStoreName(store, locale),
          text: localizeDescription(store.descriptionKo, locale) ?? "",
          url: window.location.href,
        });
        setShareState("done");
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
        setShareState("done");
        return;
      }
      setShareState("unavailable");
    } catch {
      setShareState("unavailable");
    }
  };

  return (
    <div className="worldcup-market-mobile-actions">
      {worldCupMarketWalkingEnabled() ? <button
        type="button"
        className="worldcup-market-mobile-primary"
        disabled={store.navigationTarget === null}
        onClick={() => {
          const coordinate = store.navigationTarget;
          if (!coordinate) return;
          onStartWalking({ name: localizeStoreName(store, locale), coordinate });
        }}
      >
        {walkLabel(locale, ui)}
      </button> : null}
      <div className="worldcup-market-mobile-secondary-actions">
        <button type="button" className={saved ? "is-selected" : ""} aria-pressed={saved} onClick={() => setSaved((value) => !value)}>
          <span aria-hidden="true">♡</span>{saved ? ui.saved : ui.save}
        </button>
        <button type="button" onClick={() => void share()}>
          <span aria-hidden="true">↗</span>{shareState === "done" ? ui.shared : shareState === "unavailable" ? ui.shareUnavailable : ui.share}
        </button>
      </div>
    </div>
  );
}

function MenuCarousel({ store, locale }: { readonly store: WorldCupMarketStore; readonly locale: Locale }) {
  const ui = getWorldCupMarketUiText(locale);
  const [expanded, setExpanded] = useState(false);
  const products = useMemo(() => displayProducts(store), [store]);
  const shownProducts = expanded ? products : products.slice(0, 6);

  return (
    <section className="worldcup-market-mobile-section worldcup-market-popular-menu" aria-labelledby="worldcup-market-popular-menu-title">
      <div className="worldcup-market-section-heading">
        <h3 id="worldcup-market-popular-menu-title">{ui.popularMenu}</h3>
        {products.length > 6 ? (
          <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? ui.showLess : ui.seeAll}</button>
        ) : null}
      </div>
      {shownProducts.length > 0 ? (
        <div className="worldcup-market-menu-carousel" role="region" aria-label={ui.popularMenu}>
          {shownProducts.map((product) => {
            const signature = store.representativeMenu?.nameKo === product.nameKo;
            return (
              <article key={`${store.id}-${product.nameKo}`} className="worldcup-market-menu-card">
                {signature ? <span className="worldcup-market-signature">{ui.signature}</span> : null}
                <strong>{localizeProductName(product.nameKo, locale)}</strong>
                <span>{priceText(product.priceKrw, product.priceLabel, locale, ui.unknown)}</span>
              </article>
            );
          })}
        </div>
      ) : <p className="worldcup-market-empty-copy">{ui.unknown}</p>}
    </section>
  );
}

function purchaseText(value: boolean | null, ui: ReturnType<typeof getWorldCupMarketUiText>): string {
  if (value === null) return ui.unavailable;
  return value ? ui.available : ui.notAvailable;
}

function StoreAbout({ store, locale }: { readonly store: WorldCupMarketStore; readonly locale: Locale }) {
  const ui = getWorldCupMarketUiText(locale);
  const description = localizeDescription(store.descriptionKo, locale);
  const orderNote = localizeOrderNote(store.purchaseInfo.orderNote, locale);
  return (
    <section className="worldcup-market-mobile-section worldcup-market-about-shop" aria-labelledby="worldcup-market-about-shop-title">
      <h3 id="worldcup-market-about-shop-title">{ui.aboutShop}</h3>
      <p>{description ?? ui.unknown}</p>
      <p>{store.address}</p>
      {store.phone ? <p>{store.phone}</p> : null}
      <dl className="worldcup-market-purchase-facts">
        <div><dt>{ui.takeout}</dt><dd>{purchaseText(store.purchaseInfo.takeout, ui)}</dd></div>
        <div><dt>{ui.dineIn}</dt><dd>{purchaseText(store.purchaseInfo.dineIn, ui)}</dd></div>
      </dl>
      {orderNote ? <p className="worldcup-market-order-note"><strong>{ui.orderNote}</strong>{orderNote}</p> : null}
    </section>
  );
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
  return (
    <article className="worldcup-market-mobile-detail" aria-labelledby="worldcup-market-selected-title">
      <div className="worldcup-market-mobile-hero-image">
        {image ? <img src={image.url} alt={`${name} ${ui.shopPhoto}`} loading="eager" /> : <div className="worldcup-market-store-image-fallback" role="img" aria-label={`${name} ${ui.aboutShop}`}><span>{localizeCategory(store.category, locale)}</span></div>}
      </div>
      <div className="worldcup-market-mobile-detail-body">
        <h2 id="worldcup-market-selected-title">{name}</h2>
        <p className="worldcup-market-mobile-category">{localizeCategory(store.category, locale)}</p>
        {getWorldCupMarketMapPlacement(store.id)?.approximate ? <small className="worldcup-market-approximate">{ui.approximateLocation}</small> : null}
        <p className="worldcup-market-mobile-description">{localizeDescription(store.descriptionKo, locale) ?? ui.unknown}</p>
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
  return (
    <ul className="worldcup-market-nearby-rail" aria-label={ui.nearbyTitle}>
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
              <small>{localizeCategory(store.category, locale)}</small>
            </button>
          </li>
        );
      })}
    </ul>
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
        <p>{store.address}</p>
        {getWorldCupMarketMapPlacement(store.id)?.approximate ? <small className="worldcup-market-approximate">{ui.approximateLocation}</small> : null}
        {sharedLocationCount > 1 ? (
          <p role="note">{ui.sharedLocationNotice.replace("{count}", String(sharedLocationCount))}</p>
        ) : null}
        {!store.storeLocation && WORLD_CUP_MARKET_STORES.some((item) => item.storeLocation) ? (
          <p role="status">{ui.locationTitle}: {ui.unknown}</p>
        ) : null}
        {WORLD_CUP_MARKET_STORES.some((item) => item.storeLocation) ? (
          <WorldCupMarketMap stores={WORLD_CUP_MARKET_STORES} selectedId={selectedId} here={null} onSelect={onSelect} locale={locale} mode="detail" />
        ) : (
          <p role="status">{ui.unknown}</p>
        )}
      </section>

      {worldCupMarketWalkingEnabled() ? <div className="worldcup-market-nearby-cta">
        <button type="button" disabled={store.navigationTarget === null}
        onClick={() => {
          const coordinate = store.navigationTarget;
          if (!coordinate) return;
          onStartWalking({ name: localizeStoreName(store, locale), coordinate });
        }}>
          {walkLabel(locale, ui)}
        </button>
      </div> : null}
    </section>
  );
}

function MarketOverview({ locale, onSelect }: {
  readonly locale: Locale;
  readonly onSelect: (storeId: string) => void;
}) {
  const ui = getWorldCupMarketUiText(locale);
  const [category, setCategory] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(WORLD_CUP_MARKET_STORES.map((store) => store.category))], []);
  const stores = useMemo(() => WORLD_CUP_MARKET_STORES.filter((store) => category === null || store.category === category), [category]);
  return (
    <div className="worldcup-market-overview">
      <div className="worldcup-market-overview-heading">
        <h1>{ui.market}</h1>
        <p>{ui.subtitle}</p>
      </div>
      <div className="worldcup-market-category-filter" role="group" aria-label={ui.categoryFilter}>
        <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>{ui.allCategories}</button>
        {categories.map((item) => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{localizeCategory(item, locale)}</button>)}
      </div>
      <div className="worldcup-market-overview-map">
        <WorldCupMarketMap stores={stores} selectedId="" here={null} onSelect={onSelect} locale={locale} mode="overview" />
      </div>
      <section className="worldcup-market-overview-stores" aria-labelledby="worldcup-market-browse-title">
        <div className="worldcup-market-section-heading">
          <h2 id="worldcup-market-browse-title">{ui.browseStores}</h2>
          <span role="status">{ui.storesCount(stores.length)}</span>
        </div>
        <ul className="worldcup-market-overview-cards" aria-label={ui.browseStores}>
          {stores.map((store) => <li key={store.id}>
            <button type="button" onClick={() => onSelect(store.id)} aria-label={localizeStoreName(store, locale)}>
              <span className="worldcup-market-store-number">{store.corridorOrder}</span>
              <span><strong>{localizeStoreName(store, locale)}</strong><small>{localizeCategory(store.category, locale)}</small></span>
              <span aria-hidden="true">›</span>
            </button>
          </li>)}
        </ul>
      </section>
      <section className="worldcup-market-overview-list" aria-labelledby="worldcup-market-list-title">
        <h2 id="worldcup-market-list-title">{ui.storeList}</h2>
        <ul>
          {stores.map((store) => <li key={store.id}>
            <button type="button" onClick={() => onSelect(store.id)}>
              <span className="worldcup-market-store-number">{store.corridorOrder}</span>
              <span><strong>{localizeStoreName(store, locale)}</strong><small>{localizeCategory(store.category, locale)}</small></span>
              {getWorldCupMarketMapPlacement(store.id)?.approximate ? <small className="worldcup-market-approximate">{ui.approximateLocation}</small> : null}
              <span aria-hidden="true">›</span>
            </button>
          </li>)}
        </ul>
      </section>
    </div>
  );
}

export default function WorldCupMarketDemo({ locale, onLocaleChange, onStartWalking }: WorldCupMarketDemoProps) {
  const [selectedId, setSelectedId] = useState(WORLD_CUP_MARKET_STORES[0]?.id ?? "");
  const [screenName, setScreenName] = useState<DemoScreen>("map");
  const ui = getWorldCupMarketUiText(locale);
  const selected = WORLD_CUP_MARKET_STORES.find((store) => store.id === selectedId) ?? WORLD_CUP_MARKET_STORES[0];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncDeepLink = () => {
      const requestedStore = new URLSearchParams(window.location.search).get("store");
      if (hasStore(requestedStore)) {
        setSelectedId(requestedStore);
        setScreenName("detail");
      } else {
        setScreenName("map");
      }
    };
    syncDeepLink();
    window.addEventListener("popstate", syncDeepLink);
    return () => window.removeEventListener("popstate", syncDeepLink);
  }, []);

  const selectStore = useCallback((storeId: string) => {
    if (!hasStore(storeId)) return;
    setSelectedId(storeId);
    setScreenName("detail");
    updateStoreDeepLink(storeId);
    window.scrollTo?.({ top: 0 });
  }, []);

  const backToMap = useCallback(() => {
    setScreenName("map");
    updateStoreDeepLink(null);
    window.scrollTo?.({ top: 0 });
  }, []);

  if (!selected) return null;

  if (screenName === "map") {
    return (
      <section className="worldcup-market-demo worldcup-market-mobile-screen" aria-label={ui.title}>
        <WorldCupMarketMobileHeader locale={locale} onLocaleChange={onLocaleChange} />
        <MarketOverview locale={locale} onSelect={selectStore} />
      </section>
    );
  }

  if (screenName === "nearby") {
    return (
      <section className="worldcup-market-demo worldcup-market-mobile-screen" aria-label={getWorldCupMarketUiText(locale).title}>
        <NearbyScreen
          store={selected}
          selectedId={selectedId}
          locale={locale}
          onLocaleChange={onLocaleChange}
          onSelect={(storeId) => { setSelectedId(storeId); updateStoreDeepLink(storeId); }}
          onBack={() => setScreenName("detail")}
          onStartWalking={onStartWalking}
        />
      </section>
    );
  }

  return (
    <section className="worldcup-market-demo worldcup-market-mobile-screen" aria-labelledby="worldcup-market-demo-title">
      <WorldCupMarketMobileHeader locale={locale} onLocaleChange={onLocaleChange} onBack={backToMap} backLabel={ui.backToMap} />
      <h1 id="worldcup-market-demo-title" className="visually-hidden">{ui.title}</h1>
      <StoreDetail key={selected.id} store={selected} locale={locale} onStartWalking={onStartWalking} onOpenNearby={() => setScreenName("nearby")} />
      <StoreSwitcher stores={WORLD_CUP_MARKET_STORES} selectedId={selectedId} locale={locale} onSelect={selectStore} />
    </section>
  );
}
