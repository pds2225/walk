"use client";

// Render exact store coordinates without spreading shared building locations.
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { localizeCategory, localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import type { Coordinate } from "../lib/types";
import type { VerifiedLocation, WorldCupMarketStore } from "../lib/worldCupMarketStores";

const STYLE_URL = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const ZOOM = 17;
const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#eef1f5" } }],
};

export interface WorldCupMarketMapProps {
  readonly stores: readonly WorldCupMarketStore[];
  readonly selectedId: string;
  readonly here: Coordinate | null;
  readonly onSelect: (storeId: string) => void;
  readonly locale: Locale;
}

function locatedStores(stores: readonly WorldCupMarketStore[]): Array<WorldCupMarketStore & { readonly storeLocation: VerifiedLocation }> {
  return stores.filter((store): store is WorldCupMarketStore & { readonly storeLocation: VerifiedLocation } => store.storeLocation !== null);
}

function fillStoreMarker(button: HTMLElement, store: WorldCupMarketStore, locale: Locale): void {
  const ui = getWorldCupMarketUiText(locale);
  const name = localizeStoreName(store, locale);
  const category = localizeCategory(store.category, locale);
  button.setAttribute("aria-label", `${name} ${ui.selectOnMap}`);
  const nameNode = button.querySelector(".worldcup-market-map-marker-name");
  const categoryNode = button.querySelector("small");
  if (nameNode) nameNode.textContent = name;
  if (categoryNode) categoryNode.textContent = category;
}

function selectStoreMarker(element: HTMLElement, selected: boolean): void {
  element.querySelector(".worldcup-market-map-marker")?.classList.toggle("is-selected", selected);
  // Shared address coordinates stay exact; bring only the selected label forward.
  element.style.zIndex = selected ? "1" : "0";
}

function makeStoreMarker(store: WorldCupMarketStore, locale: Locale, onSelect: (id: string) => void): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "worldcup-market-map-marker-wrap";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "worldcup-market-map-marker";
  const image = store.storeImages[0];
  if (image) {
    const img = document.createElement("img");
    img.className = "worldcup-market-map-marker-image";
    img.src = image.url;
    img.alt = "";
    button.appendChild(img);
  }
  const copy = document.createElement("span");
  copy.className = "worldcup-market-map-marker-copy";
  const nameNode = document.createElement("strong");
  nameNode.className = "worldcup-market-map-marker-name";
  const categoryNode = document.createElement("small");
  copy.append(nameNode, categoryNode);
  const pin = document.createElement("span");
  pin.className = "worldcup-market-map-pin";
  pin.setAttribute("aria-hidden", "true");
  pin.textContent = "●";
  button.append(copy, pin);
  fillStoreMarker(button, store, locale);
  button.addEventListener("click", () => onSelect(store.id));
  wrapper.appendChild(button);
  return wrapper;
}

export default function WorldCupMarketMap({ stores, selectedId, here, onSelect, locale }: WorldCupMarketMapProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const storeMarkers = useRef(new Map<string, maplibregl.Marker>());
  const hereMarker = useRef<maplibregl.Marker | null>(null);
  const selectedRef = useRef(selectedId);
  const storesRef = useRef(stores);
  const localeRef = useRef(locale);
  selectedRef.current = selectedId;
  storesRef.current = stores;
  localeRef.current = locale;
  const pins = locatedStores(stores);

  useEffect(() => {
    const first = locatedStores(storesRef.current)[0]?.storeLocation;
    if (!container.current || map.current || !first) return;
    const instance = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: [first.longitude, first.latitude],
      zoom: ZOOM,
      attributionControl: { compact: true },
    });
    map.current = instance;
    let usedFallback = false;

    const renderMarkers = () => {
      for (const marker of storeMarkers.current.values()) marker.remove();
      storeMarkers.current.clear();
      const bounds = new maplibregl.LngLatBounds();
      for (const store of locatedStores(storesRef.current)) {
        const element = makeStoreMarker(store, localeRef.current, onSelect);
        selectStoreMarker(element, store.id === selectedRef.current);
        const marker = new maplibregl.Marker({ element, anchor: "bottom" })
          .setLngLat([store.storeLocation.longitude, store.storeLocation.latitude])
          .addTo(instance);
        storeMarkers.current.set(store.id, marker);
        bounds.extend([store.storeLocation.longitude, store.storeLocation.latitude]);
      }
      if (!bounds.isEmpty()) instance.fitBounds(bounds, { padding: 48, maxZoom: ZOOM, duration: 0 });
    };

    instance.on("error", (event) => {
      if (usedFallback || instance.isStyleLoaded()) return;
      usedFallback = true;
      console.warn("월드컵시장 지도 타일을 불러오지 못해 마커만 표시합니다.", event?.error?.message ?? "");
      instance.setStyle(FALLBACK_STYLE);
    });
    instance.on("load", renderMarkers);

    return () => {
      for (const marker of storeMarkers.current.values()) marker.remove();
      hereMarker.current?.remove();
      instance.remove();
      map.current = null;
    };
    // 실제 MapLibre 인스턴스는 한 번만 만들고 아래 effect에서 위치·선택 상태만 갱신한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    for (const [id, marker] of storeMarkers.current) {
      selectStoreMarker(marker.getElement(), id === selectedId);
    }
  }, [selectedId]);

  useEffect(() => {
    for (const store of stores) {
      const button = storeMarkers.current.get(store.id)?.getElement().querySelector(".worldcup-market-map-marker");
      if (button instanceof HTMLElement) fillStoreMarker(button, store, locale);
    }
  }, [locale, stores]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !here) return;
    if (!hereMarker.current) {
      const element = document.createElement("div");
      element.className = "worldcup-market-here-marker";
      element.innerHTML = '<span class="worldcup-market-here-dot"></span><span class="worldcup-market-here-pulse"></span>';
      hereMarker.current = new maplibregl.Marker({ element, anchor: "center" }).addTo(instance);
    }
    hereMarker.current.setLngLat([here.longitude, here.latitude]);
  }, [here]);

  const ui = getWorldCupMarketUiText(locale);
  if (pins.length === 0) {
    return <div className="worldcup-market-market-map" role="status" aria-label={ui.marketMap}>{ui.unknown}</div>;
  }

  return <div ref={container} className="worldcup-market-market-map" aria-label={ui.marketMap} />;
}
