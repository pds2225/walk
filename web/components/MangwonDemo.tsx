"use client";

import { useCallback, useMemo, useState } from "react";
import { getMangwonUiText, type Locale } from "../lib/i18n";
import {
  localizeCategory,
  localizeDescription,
  localizeHours,
  localizeOrderNote,
  localizePriceLabel,
  localizeProductName,
  localizeStoreName,
} from "../lib/mangwonStoreCopy";
import { MANGWON_STORES, type MangwonStore, type StoreProduct } from "../lib/mangwonStores";
import type { Coordinate } from "../lib/types";
import MangwonMarketMap from "./MangwonMarketMap";
import MangwonStorefront360 from "./MangwonStorefront360";

interface MangwonDemoProps {
  readonly locale: Locale;
  readonly onLocaleChange?: (locale: Locale) => void;
  readonly onStartWalking: (target: { name: string; coordinate: Coordinate }) => void;
}

type ShareState = "idle" | "done" | "unavailable";
type DisplayProduct = StoreProduct;
type DemoScreen = "detail" | "nearby";

function priceText(
  price: number | null,
  priceLabel: string | null,
  locale: Locale,
  unknown: string,
): string {
  if (price !== null) {
    return locale === "en" ? `₩${price.toLocaleString("ko-KR")}` : `${price.toLocaleString("ko-KR")}원`;
  }
  return localizePriceLabel(priceLabel, locale) ?? unknown;
}

function displayProducts(store: MangwonStore): DisplayProduct[] {
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

function MangwonMobileHeader({ locale, onLocaleChange, onBack }: {
  readonly locale: Locale;
  readonly onLocaleChange?: ((locale: Locale) => void) | undefined;
  readonly onBack?: (() => void) | undefined;
}) {
  const ui = getMangwonUiText(locale);
  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
  };

  return (
    <header className="mangwon-mobile-header">
      <button type="button" className="mangwon-back-button" aria-label={ui.back} onClick={goBack}>‹</button>
      <div className="mangwon-mobile-brand">
        <strong>K-Navi</strong>
        <span>{ui.market}</span>
      </div>
      <div className="mangwon-locale-switcher" role="group" aria-label={`${ui.language} 선택`}>
        <span className="mangwon-globe" aria-hidden="true">🌐</span>
        <button type="button" className={locale === "ko" ? "is-active" : ""} aria-pressed={locale === "ko"} onClick={() => onLocaleChange?.("ko")}>KO</button>
        <button type="button" className={locale === "en" ? "is-active" : ""} aria-pressed={locale === "en"} onClick={() => onLocaleChange?.("en")}>EN</button>
      </div>
    </header>
  );
}

function StoreSwitcher({ stores, selectedId, locale, onSelect }: {
  readonly stores: readonly MangwonStore[];
  readonly selectedId: string;
  readonly locale: Locale;
  readonly onSelect: (storeId: string) => void;
}) {
  const ui = getMangwonUiText(locale);
  return (
    <nav className="mangwon-store-switcher" aria-label={ui.selectShop}>
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

function StoreKeyFacts({ store, locale }: { readonly store: MangwonStore; readonly locale: Locale }) {
  const ui = getMangwonUiText(locale);
  const menu = store.representativeMenu;
  const firstProduct = store.products[0];
  return (
    <dl className="mangwon-mobile-key-facts">
      <div>
        <dt><span aria-hidden="true">✦</span>{ui.representativeMenu}</dt>
        <dd>{localizeProductName(menu?.nameKo ?? firstProduct?.nameKo ?? "", locale) || ui.unknown}</dd>
      </div>
      <div>
        <dt><span aria-hidden="true">₩</span>{ui.price}</dt>
        <dd>{priceText(menu?.priceWon ?? firstProduct?.priceKrw ?? null, firstProduct?.priceLabel ?? null, locale, ui.unknown)}</dd>
      </div>
      <div>
        <dt><span aria-hidden="true">◷</span>{ui.hours}</dt>
        <dd>{localizeHours(store.businessHours, locale) ?? ui.unknown}</dd>
      </div>
    </dl>
  );
}

function StorePrimaryActions({ store, locale, onStartWalking }: {
  readonly store: MangwonStore;
  readonly locale: Locale;
  readonly onStartWalking: MangwonDemoProps["onStartWalking"];
}) {
  const ui = getMangwonUiText(locale);
  const [saved, setSaved] = useState(false);
  const [shareState, setShareState] = useState<ShareState>("idle");

  const share = async () => {
    if (typeof navigator === "undefined") return;
    const browserNavigator = navigator as Navigator & {
      share?: (data: { title: string; text: string; url: string }) => Promise<void>;
    };
    try {
      if (typeof browserNavigator.share === "function") {
        await browserNavigator.share({ title: store.nameKo, text: store.descriptionKo ?? "", url: window.location.href });
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
    <div className="mangwon-mobile-actions">
      <button
        type="button"
        className="mangwon-mobile-primary"
        onClick={() => onStartWalking({ name: store.nameKo, coordinate: store.navigationTarget })}
      >
        {locale === "en" ? ui.startWalkingGuide : ui.goThere}
      </button>
      <div className="mangwon-mobile-secondary-actions">
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

function MenuCarousel({ store, locale }: { readonly store: MangwonStore; readonly locale: Locale }) {
  const ui = getMangwonUiText(locale);
  const [expanded, setExpanded] = useState(false);
  const products = useMemo(() => displayProducts(store), [store]);
  const shownProducts = expanded ? products : products.slice(0, 6);

  return (
    <section className="mangwon-mobile-section mangwon-popular-menu" aria-labelledby="mangwon-popular-menu-title">
      <div className="mangwon-section-heading">
        <h3 id="mangwon-popular-menu-title">{ui.popularMenu}</h3>
        {products.length > 6 ? (
          <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? ui.showLess : ui.seeAll}</button>
        ) : null}
      </div>
      {shownProducts.length > 0 ? (
        <div className="mangwon-menu-carousel" role="region" aria-label={ui.popularMenu}>
          {shownProducts.map((product) => {
            const signature = store.representativeMenu?.nameKo === product.nameKo;
            return (
              <article key={`${store.id}-${product.nameKo}`} className="mangwon-menu-card">
                {signature ? <span className="mangwon-signature">{ui.signature}</span> : null}
                <strong>{localizeProductName(product.nameKo, locale)}</strong>
                <span>{priceText(product.priceKrw, product.priceLabel, locale, ui.unknown)}</span>
              </article>
            );
          })}
        </div>
      ) : <p className="mangwon-empty-copy">{ui.unknown}</p>}
    </section>
  );
}

function purchaseText(value: boolean | null, ui: ReturnType<typeof getMangwonUiText>): string {
  if (value === null) return ui.unavailable;
  return value ? ui.available : ui.notAvailable;
}

function StoreAbout({ store, locale }: { readonly store: MangwonStore; readonly locale: Locale }) {
  const ui = getMangwonUiText(locale);
  const description = localizeDescription(store.descriptionKo, locale);
  const orderNote = localizeOrderNote(store.purchaseInfo.orderNote, locale);
  return (
    <section className="mangwon-mobile-section mangwon-about-shop" aria-labelledby="mangwon-about-shop-title">
      <h3 id="mangwon-about-shop-title">{ui.aboutShop}</h3>
      <p>{description ?? ui.unknown}</p>
      <dl className="mangwon-purchase-facts">
        <div><dt>{ui.takeout}</dt><dd>{purchaseText(store.purchaseInfo.takeout, ui)}</dd></div>
        <div><dt>{ui.dineIn}</dt><dd>{purchaseText(store.purchaseInfo.dineIn, ui)}</dd></div>
      </dl>
      {orderNote ? <p className="mangwon-order-note"><strong>{ui.orderNote}</strong>{orderNote}</p> : null}
    </section>
  );
}

function StoreDetail({ store, locale, onStartWalking, onOpenNearby }: {
  readonly store: MangwonStore;
  readonly locale: Locale;
  readonly onStartWalking: MangwonDemoProps["onStartWalking"];
  readonly onOpenNearby: () => void;
}) {
  const ui = getMangwonUiText(locale);
  const image = store.storeImages[0];
  const name = localizeStoreName(store, locale);
  return (
    <article className="mangwon-mobile-detail" aria-labelledby="mangwon-selected-title">
      <div className="mangwon-mobile-hero-image">
        {image ? <img src={image.url} alt={`${name} ${locale === "en" ? "shop photo" : "대표 이미지"}`} loading="eager" /> : <div className="mangwon-store-image-fallback" role="img" aria-label={`${name} ${ui.aboutShop}`}><span>{localizeCategory(store.category, locale)}</span></div>}
      </div>
      <div className="mangwon-mobile-detail-body">
        <h2 id="mangwon-selected-title">{name}</h2>
        <p className="mangwon-mobile-category">{localizeCategory(store.category, locale)}</p>
        <p className="mangwon-mobile-description">{localizeDescription(store.descriptionKo, locale) ?? ui.unknown}</p>
        <StoreKeyFacts store={store} locale={locale} />
        <StorePrimaryActions store={store} locale={locale} onStartWalking={onStartWalking} />
      </div>
      <MenuCarousel store={store} locale={locale} />
      <StoreAbout store={store} locale={locale} />
      <div className="mangwon-nearby-entry">
        <button type="button" onClick={onOpenNearby}>
          <span>{locale === "en" ? "Nearby Shops · 360 · Map" : "주변 점포 · 360 · 지도"}</span>
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
  return (
    <div className="mangwon-nearby-rail" role="list" aria-label={locale === "en" ? "Nearby Shops" : "주변 점포"}>
      {MANGWON_STORES.map((store) => {
        const image = store.storeImages[0];
        const selected = store.id === selectedId;
        return (
          <button
            key={store.id}
            type="button"
            role="listitem"
            className={selected ? "is-selected" : ""}
            aria-pressed={selected}
            onClick={() => onSelect(store.id)}
          >
            {image ? <img src={image.url} alt="" /> : <span className="mangwon-nearby-thumb-fallback" aria-hidden="true" />}
            <strong>{localizeStoreName(store, locale)}</strong>
            <small>{localizeCategory(store.category, locale)}</small>
          </button>
        );
      })}
    </div>
  );
}

function NearbyScreen({ store, selectedId, locale, onLocaleChange, onSelect, onBack, onStartWalking }: {
  readonly store: MangwonStore;
  readonly selectedId: string;
  readonly locale: Locale;
  readonly onLocaleChange?: ((locale: Locale) => void) | undefined;
  readonly onSelect: (storeId: string) => void;
  readonly onBack: () => void;
  readonly onStartWalking: MangwonDemoProps["onStartWalking"];
}) {
  const ui = getMangwonUiText(locale);
  const image = store.storeImages[0];

  return (
    <section className="mangwon-nearby-screen" aria-labelledby="mangwon-nearby-title">
      <MangwonMobileHeader locale={locale} onLocaleChange={onLocaleChange} onBack={onBack} />
      <div className="mangwon-nearby-heading">
        <p>{locale === "en" ? "EXPLORE AROUND YOU" : "주변 둘러보기"}</p>
        <h2 id="mangwon-nearby-title">{locale === "en" ? "Nearby Shops" : "주변 점포"}</h2>
      </div>
      <NearbyShopRail selectedId={selectedId} locale={locale} onSelect={onSelect} />

      <article className="mangwon-nearby-selected">
        {image ? <img src={image.url} alt="" /> : null}
        <div>
          <h3>{localizeStoreName(store, locale)}</h3>
          <p>{localizeCategory(store.category, locale)}</p>
          <span>{localizeDescription(store.descriptionKo, locale) ?? ui.unknown}</span>
        </div>
      </article>

      <section className="mangwon-nearby-block" aria-labelledby="mangwon-storefront-title">
        <div className="mangwon-nearby-block-heading">
          <h3 id="mangwon-storefront-title">{locale === "en" ? "Storefront 360" : "점포 앞 360"}</h3>
          <span>Google Street View</span>
        </div>
        <MangwonStorefront360 key={`storefront-${store.id}`} store={store} locale={locale} />
      </section>

      <section className="mangwon-nearby-block" aria-labelledby="mangwon-location-map-title">
        <div className="mangwon-nearby-block-heading">
          <h3 id="mangwon-location-map-title">{locale === "en" ? "Location" : "위치"}</h3>
          <span>{locale === "en" ? "Mangwon Market" : "망원시장"}</span>
        </div>
        <MangwonMarketMap stores={MANGWON_STORES} selectedId={selectedId} here={null} onSelect={onSelect} locale={locale} />
      </section>

      <div className="mangwon-nearby-cta">
        <button type="button" onClick={() => onStartWalking({ name: store.nameKo, coordinate: store.navigationTarget })}>
          {locale === "en" ? ui.startWalkingGuide : ui.goThere}
        </button>
      </div>
    </section>
  );
}

export default function MangwonDemo({ locale, onLocaleChange, onStartWalking }: MangwonDemoProps) {
  const [selectedId, setSelectedId] = useState(MANGWON_STORES[0]?.id ?? "");
  const [screenName, setScreenName] = useState<DemoScreen>("detail");
  const selected = MANGWON_STORES.find((store) => store.id === selectedId) ?? MANGWON_STORES[0];

  const selectStore = useCallback((storeId: string) => setSelectedId(storeId), []);
  if (!selected) return null;

  if (screenName === "nearby") {
    return (
      <section className="mangwon-demo mangwon-mobile-screen" aria-label={getMangwonUiText(locale).title}>
        <NearbyScreen
          store={selected}
          selectedId={selectedId}
          locale={locale}
          onLocaleChange={onLocaleChange}
          onSelect={selectStore}
          onBack={() => setScreenName("detail")}
          onStartWalking={onStartWalking}
        />
      </section>
    );
  }

  return (
    <section className="mangwon-demo mangwon-mobile-screen" aria-labelledby="mangwon-demo-title">
      <MangwonMobileHeader locale={locale} onLocaleChange={onLocaleChange} />
      <h1 id="mangwon-demo-title" className="visually-hidden">{getMangwonUiText(locale).title}</h1>
      <StoreDetail key={selected.id} store={selected} locale={locale} onStartWalking={onStartWalking} onOpenNearby={() => setScreenName("nearby")} />
      <StoreSwitcher stores={MANGWON_STORES} selectedId={selectedId} locale={locale} onSelect={selectStore} />
    </section>
  );
}
