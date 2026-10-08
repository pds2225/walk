"use client";

import { useEffect, useRef, useState } from "react";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { loadNaverMaps, naverPanoramaConfigured } from "../lib/roadview";
import { localizeCategory, localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import {
  getWorldCupMarketMapPlacement,
  layoutWorldCupMarketMapPins,
  WORLD_CUP_MARKET_MAP_PLACEMENTS,
  type WorldCupMarketMapPin,
} from "../lib/worldCupMarketMapLayout";
import type { Coordinate } from "../lib/types";
import type { WorldCupMarketStore } from "../lib/worldCupMarketStores";

// Only the map surface used here is typed. The shared SDK also loads Panorama.
interface NaverCoordinate { lat(): number; lng(): number }
interface NaverMap {
  fitBounds(points: NaverCoordinate[], options: { top: number; right: number; bottom: number; left: number; maxZoom: number }): void;
  getProjection(): { fromCoordToOffset(position: NaverCoordinate): { x: number; y: number } };
  getSize(): { width: number; height: number };
  autoResize(): void;
  destroy(): void;
}
interface NaverMapSdk {
  LatLng: new (latitude: number, longitude: number) => NaverCoordinate;
  Map: new (container: HTMLElement, options: { center: NaverCoordinate; zoom: number; minZoom: number; zoomControl: boolean; mapDataControl: boolean }) => NaverMap;
  Event: {
    addListener(target: NaverMap, event: string, handler: () => void): unknown;
    removeListener(listener: unknown): void;
  };
}

export interface WorldCupMarketMapProps {
  readonly stores: readonly WorldCupMarketStore[];
  readonly selectedId: string;
  readonly here: Coordinate | null;
  readonly onSelect: (storeId: string) => void;
  readonly locale: Locale;
  readonly mode?: "overview" | "detail";
}

interface MapOverlay {
  readonly pins: readonly WorldCupMarketMapPin[];
  readonly here: { x: number; y: number } | null;
}

export default function WorldCupMarketMap({ stores, selectedId, here, onSelect, locale, mode = "overview" }: WorldCupMarketMapProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<{ instance: NaverMap; sdk: NaverMapSdk } | null>(null);
  const current = useRef({ stores, here });
  current.current = { stores, here };
  const updateOverlay = useRef<() => void>(() => undefined);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(() => naverPanoramaConfigured() ? "loading" : "unavailable");
  const [overlay, setOverlay] = useState<MapOverlay>({ pins: [], here: null });
  const ui = getWorldCupMarketUiText(locale);
  const byId = new Map(stores.map((store) => [store.id, store]));

  useEffect(() => {
    if (!container.current || !naverPanoramaConfigured()) return;
    let disposed = false;
    let listeners: unknown[] = [];
    let resize: ResizeObserver | null = null;
    const host = container.current;

    loadNaverMaps().then((loaded) => {
      if (disposed) return;
      const sdk = loaded as unknown as NaverMapSdk;
      const first = WORLD_CUP_MARKET_MAP_PLACEMENTS[0]!.displayLocation;
      const instance = new sdk.Map(host, {
        center: new sdk.LatLng(first.latitude, first.longitude),
        zoom: 17,
        minZoom: 14,
        zoomControl: true,
        mapDataControl: true,
      });
      map.current = { instance, sdk };

      updateOverlay.current = () => {
        if (disposed) return;
        const projection = instance.getProjection();
        const { width, height } = instance.getSize();
        if (!projection || width <= 0 || height <= 0) return;
        const points = current.current.stores.flatMap((store) => {
          const placement = getWorldCupMarketMapPlacement(store.id);
          if (!placement) return [];
          const position = placement.displayLocation;
          const pixel = projection.fromCoordToOffset(new sdk.LatLng(position.latitude, position.longitude));
          return [{ storeId: store.id, x: pixel.x, y: pixel.y }];
        });
        const location = current.current.here;
        setOverlay({
          pins: layoutWorldCupMarketMapPins(points, width, height),
          here: location ? projection.fromCoordToOffset(new sdk.LatLng(location.latitude, location.longitude)) : null,
        });
      };

      // Fit the whole market once; filters keep the same map and geographic points.
      const fitMarket = () => {
        instance.fitBounds(WORLD_CUP_MARKET_MAP_PLACEMENTS.map(({ displayLocation }) =>
          new sdk.LatLng(displayLocation.latitude, displayLocation.longitude)),
        { top: 55, right: 55, bottom: 55, left: 55, maxZoom: 18 });
        updateOverlay.current();
      };
      listeners = ["init", "bounds_changed", "idle"].map((event) =>
        sdk.Event.addListener(instance, event, () => updateOverlay.current()));
      fitMarket();
      if (typeof ResizeObserver !== "undefined") {
        resize = new ResizeObserver(() => {
          instance.autoResize();
          fitMarket();
        });
        resize.observe(host);
      }
      setStatus("ready");
    }).catch(() => {
      if (!disposed) setStatus("unavailable");
    });

    return () => {
      disposed = true;
      resize?.disconnect();
      const active = map.current;
      if (active) {
        for (const listener of listeners) active.sdk.Event.removeListener(listener);
        active.instance.destroy();
      }
      map.current = null;
      updateOverlay.current = () => undefined;
    };
  }, []);

  useEffect(() => { updateOverlay.current(); }, [stores, here]);

  return (
    <div className="worldcup-market-market-map" role="region" aria-label={ui.marketMap} data-map-provider="naver" data-map-mode={mode}>
      <div ref={container} className="worldcup-market-naver-map" aria-hidden={status !== "ready"} />
      {status === "loading" ? <p className="worldcup-market-map-status" role="status">{ui.mapLoading}</p> : null}
      {status === "unavailable" ? (
        <div className="worldcup-market-map-fallback">
          <p role="status">{ui.mapUnavailable}</p>
          <ul aria-label={ui.storeList}>
            {stores.map((store) => <li key={store.id}>
              <button type="button" onClick={() => onSelect(store.id)}>
                <span className="worldcup-market-store-number">{store.corridorOrder}</span>
                <span><strong>{localizeStoreName(store, locale)}</strong><small>{localizeCategory(store.category, locale)}</small></span>
              </button>
            </li>)}
          </ul>
        </div>
      ) : null}
      {status === "ready" ? <div className="worldcup-market-map-overlay">
        <svg className="worldcup-market-map-leaders" aria-hidden="true">
          {overlay.pins.map((pin) => <line key={pin.storeId} x1={pin.anchorX} y1={pin.anchorY} x2={pin.x} y2={pin.y} />)}
        </svg>
        {overlay.pins.map((pin) => {
          const store = byId.get(pin.storeId);
          if (!store) return null;
          const approximate = getWorldCupMarketMapPlacement(store.id)?.approximate ?? false;
          const label = `${localizeStoreName(store, locale)} · ${localizeCategory(store.category, locale)}${approximate ? ` · ${ui.approximateLocation}` : ""}`;
          return <button key={store.id} type="button"
            className={`worldcup-market-overview-pin${selectedId === store.id ? " is-selected" : ""}`}
            style={{ left: pin.x, top: pin.y }}
            data-store-id={store.id} data-approximate={approximate}
            aria-label={`${label} · ${ui.selectOnMap}`} aria-pressed={selectedId === store.id} title={label}
            onClick={() => onSelect(store.id)}>
            {store.corridorOrder}
          </button>;
        })}
        {overlay.here ? <div className="worldcup-market-here-marker" style={{ position: "absolute", left: overlay.here.x, top: overlay.here.y }} aria-hidden="true">
          <span className="worldcup-market-here-dot" /><span className="worldcup-market-here-pulse" />
        </div> : null}
      </div> : null}
    </div>
  );
}
