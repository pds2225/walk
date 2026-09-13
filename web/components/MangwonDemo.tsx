"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import RoadviewViewer from "./RoadviewViewer";
import { getMangwonUiText, type Locale } from "../lib/i18n";
import { GoogleStreetViewAdapter } from "../lib/roadview";
import { MANGWON_PANORAMA_POINTS, MANGWON_STORES, type MangwonStore } from "../lib/mangwonStores";
import type { Coordinate } from "../lib/types";

const MangwonMarketMap = dynamic(() => import("./MangwonMarketMap"), { ssr: false });

interface MangwonDemoProps {
  readonly locale: Locale;
  readonly onStartWalking: (target: { name: string; coordinate: Coordinate }) => void;
}

type DemoView = "panorama" | "map";

function priceText(price: number | null, unknown: string): string {
  return price === null ? unknown : `${price.toLocaleString("ko-KR")}원`;
}

function productName(store: MangwonStore, unknown: string): string {
  return store.representativeMenu?.nameKo ?? store.products[0]?.nameKo ?? unknown;
}

function productPrice(store: MangwonStore, unknown: string): string {
  const product = store.products[0];
  return priceText(store.representativeMenu?.priceWon ?? product?.priceKrw ?? null, unknown);
}

function StoreCard({
  store,
  locale,
  onStartWalking,
}: {
  readonly store: MangwonStore;
  readonly locale: Locale;
  readonly onStartWalking: MangwonDemoProps["onStartWalking"];
}) {
  const ui = getMangwonUiText(locale);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const image = store.storeImages[0];

  return (
    <article className="mangwon-store-panel" aria-labelledby="mangwon-selected-title">
      <div className="mangwon-store-hero">
        {image ? (
          <img src={image.url} alt={`${store.nameKo} 대표 이미지`} />
        ) : (
          <div className="mangwon-store-image-fallback" role="img" aria-label={`${store.nameKo} 대표 이미지 준비 중`}>
            <span>{store.category}</span>
          </div>
        )}
        <div className="mangwon-store-hero-copy">
          <p className="mangwon-kicker">{ui.selectedStore}</p>
          <h3 id="mangwon-selected-title">{store.nameKo}</h3>
          <p>{store.category}</p>
        </div>
      </div>

      <p className="mangwon-store-description">{store.descriptionKo ?? ui.unknown}</p>

      <dl className="mangwon-facts">
        <div><dt>{ui.representativeMenu}</dt><dd>{productName(store, ui.unknown)}</dd></div>
        <div><dt>{ui.price}</dt><dd>{productPrice(store, ui.unknown)}</dd></div>
        <div><dt>{ui.hours}</dt><dd>{store.businessHours ?? ui.unknown}</dd></div>
      </dl>

      <div className="mangwon-actions">
        <button type="button" className="mangwon-secondary" onClick={() => setDetailsOpen((open) => !open)} aria-expanded={detailsOpen}>
          {detailsOpen ? ui.closeDetails : ui.details}
        </button>
        <button type="button" className="mangwon-primary" onClick={() => onStartWalking({ name: store.nameKo, coordinate: store.navigationTarget })}>
          {ui.goThere}
        </button>
      </div>

      {detailsOpen ? (
        <div className="mangwon-detail-disclosure" data-testid="mangwon-detail-disclosure">
          <p>{store.verification.memo}</p>
          {store.phone ? <p>{store.phone}</p> : null}
          {store.purchaseInfo.orderNote ? <p>{store.purchaseInfo.orderNote}</p> : null}
          {store.products.length > 0 ? (
            <ul>
              {store.products.slice(0, 8).map((product) => (
                <li key={`${store.id}-${product.nameKo}`}><span>{product.nameKo}</span><strong>{priceText(product.priceKrw, ui.unknown)}</strong></li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function MangwonDemo({ locale, onStartWalking }: MangwonDemoProps) {
  const ui = getMangwonUiText(locale);
  const [view, setView] = useState<DemoView>("panorama");
  const [pointIndex, setPointIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(MANGWON_PANORAMA_POINTS[0]?.storeId ?? MANGWON_STORES[0]?.id ?? "");
  const [here, setHere] = useState<Coordinate | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "ready" | "denied">("idle");
  const googleProvider = useMemo(() => new GoogleStreetViewAdapter(), []);
  const point = MANGWON_PANORAMA_POINTS[pointIndex] ?? MANGWON_PANORAMA_POINTS[0];
  const selected = MANGWON_STORES.find((store) => store.id === selectedId) ?? MANGWON_STORES[0];

  useEffect(() => {
    if (view !== "map" || locationState !== "ready") return undefined;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationState("denied");
      return undefined;
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => setHere({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => setLocationState("denied"),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [locationState, view]);

  const selectPoint = useCallback((index: number) => {
    const normalized = (index + MANGWON_PANORAMA_POINTS.length) % MANGWON_PANORAMA_POINTS.length;
    const nextPoint = MANGWON_PANORAMA_POINTS[normalized];
    if (!nextPoint) return;
    setPointIndex(normalized);
    setSelectedId(nextPoint.storeId);
  }, []);

  const selectStore = useCallback((storeId: string) => {
    setSelectedId(storeId);
    const index = MANGWON_PANORAMA_POINTS.findIndex((item) => item.storeId === storeId);
    if (index >= 0) setPointIndex(index);
  }, []);

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationState("denied");
      return;
    }
    setLocationState("ready");
  }, []);

  if (!selected || !point) return null;

  return (
    <section className="mangwon-demo" aria-labelledby="mangwon-demo-title">
      <div className="mangwon-demo-header">
        <div><p className="mangwon-kicker">REAL DATA DEMO</p><h2 id="mangwon-demo-title">{ui.title}</h2><p>{ui.subtitle}</p></div>
        <span className="mangwon-status">{MANGWON_PANORAMA_POINTS.length} HOTSPOTS</span>
      </div>

      <div className="mangwon-view-tabs" role="tablist" aria-label="망원시장 보기 방식">
        <button type="button" role="tab" aria-selected={view === "panorama"} className={view === "panorama" ? "is-active" : ""} onClick={() => { setView("panorama"); setSelectedId(MANGWON_PANORAMA_POINTS[pointIndex]?.storeId ?? selectedId); }}>{ui.panoramaTab}</button>
        <button type="button" role="tab" aria-selected={view === "map"} className={view === "map" ? "is-active" : ""} onClick={() => setView("map")}>{ui.mapTab}</button>
      </div>

      {view === "panorama" ? (
        <>
          <div className="mangwon-hotspot-heading"><strong>{ui.hotspotLabel}</strong><span>{pointIndex + 1} / {MANGWON_PANORAMA_POINTS.length}</span></div>
          <div className="mangwon-hotspots" aria-label={ui.hotspotLabel}>
            {MANGWON_PANORAMA_POINTS.map((hotspot, index) => (
              <button key={hotspot.id} type="button" className={index === pointIndex ? "is-selected" : ""} onClick={() => selectPoint(index)} aria-pressed={index === pointIndex}>
                <span>{String(index + 1).padStart(2, "0")}</span><strong>{hotspot.label}</strong>
              </button>
            ))}
          </div>
          <div className="mangwon-panorama-nav">
            <button type="button" onClick={() => selectPoint(pointIndex - 1)}>{ui.previousPoint}</button>
            <button type="button" onClick={() => selectPoint(pointIndex + 1)}>{ui.nextPoint}</button>
          </div>
          <RoadviewViewer
            key={point.id}
            destination={point.coordinate}
            destinationName={selected.nameKo}
            approachOrigin={null}
            embedPanoId={selected.streetView.lastResolvedPanoId}
            locale={locale}
            provider={googleProvider}
            onClose={() => undefined}
            title={`Google Street View · ${selected.nameKo}`}
            showCloseButton={false}
          />
          <StoreCard store={selected} locale={locale} onStartWalking={onStartWalking} />
        </>
      ) : (
        <>
          <div className="mangwon-map-toolbar">
            <p>{locationState === "denied" ? ui.locationDenied : ""}</p>
            <button type="button" onClick={requestLocation}>{ui.locationButton}</button>
          </div>
          <MangwonMarketMap stores={MANGWON_STORES} selectedId={selectedId} here={here} onSelect={selectStore} locale={locale} />
          <StoreCard store={selected} locale={locale} onStartWalking={onStartWalking} />
        </>
      )}
    </section>
  );
}
