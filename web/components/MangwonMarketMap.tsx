"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { getMangwonUiText, type Locale } from "../lib/i18n";
import { localizeCategory, localizeStoreName } from "../lib/mangwonStoreCopy";
import type { Coordinate } from "../lib/types";
import type { MangwonStore } from "../lib/mangwonStores";

const STYLE_URL = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const ZOOM = 17;
const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#eef1f5" } }],
};

export interface MangwonMarketMapProps {
  readonly stores: readonly MangwonStore[];
  readonly selectedId: string;
  readonly here: Coordinate | null;
  readonly onSelect: (storeId: string) => void;
  readonly locale: Locale;
}

function fillStoreMarker(button: HTMLElement, store: MangwonStore, locale: Locale): void {
  const ui = getMangwonUiText(locale);
  const name = localizeStoreName(store, locale);
  const category = localizeCategory(store.category, locale);
  button.setAttribute("aria-label", `${name} ${ui.selectOnMap}`);
  const nameNode = button.querySelector(".mangwon-map-marker-name");
  const categoryNode = button.querySelector("small");
  if (nameNode) nameNode.textContent = name;
  if (categoryNode) categoryNode.textContent = category;
}

function makeStoreMarker(store: MangwonStore, locale: Locale, onSelect: (id: string) => void): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "mangwon-map-marker-wrap";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mangwon-map-marker";
  const image = store.storeImages[0];
  if (image) {
    const img = document.createElement("img");
    img.className = "mangwon-map-marker-image";
    img.src = image.url;
    img.alt = "";
    button.appendChild(img);
  }
  const copy = document.createElement("span");
  copy.className = "mangwon-map-marker-copy";
  const nameNode = document.createElement("strong");
  nameNode.className = "mangwon-map-marker-name";
  const categoryNode = document.createElement("small");
  copy.append(nameNode, categoryNode);
  const pin = document.createElement("span");
  pin.className = "mangwon-map-pin";
  pin.setAttribute("aria-hidden", "true");
  pin.textContent = "●";
  button.append(copy, pin);
  fillStoreMarker(button, store, locale);
  button.addEventListener("click", () => onSelect(store.id));
  wrapper.appendChild(button);
  return wrapper;
}

export default function MangwonMarketMap({ stores, selectedId, here, onSelect, locale }: MangwonMarketMapProps) {
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

  useEffect(() => {
    if (!container.current || map.current) return;
    const first = storesRef.current[0]?.storeLocation ?? { latitude: 37.5562, longitude: 126.9062 };
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
      for (const store of storesRef.current) {
        const element = makeStoreMarker(store, localeRef.current, onSelect);
        element.querySelector(".mangwon-map-marker")?.classList.toggle("is-selected", store.id === selectedRef.current);
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
      console.warn("망원시장 지도 타일을 불러오지 못해 마커만 표시합니다.", event?.error?.message ?? "");
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
      marker.getElement().querySelector(".mangwon-map-marker")?.classList.toggle("is-selected", id === selectedId);
    }
  }, [selectedId]);

  useEffect(() => {
    for (const store of stores) {
      const button = storeMarkers.current.get(store.id)?.getElement().querySelector(".mangwon-map-marker");
      if (button instanceof HTMLElement) fillStoreMarker(button, store, locale);
    }
  }, [locale, stores]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !here) return;
    if (!hereMarker.current) {
      const element = document.createElement("div");
      element.className = "mangwon-here-marker";
      element.innerHTML = '<span class="mangwon-here-dot"></span><span class="mangwon-here-pulse"></span>';
      hereMarker.current = new maplibregl.Marker({ element, anchor: "center" }).addTo(instance);
    }
    hereMarker.current.setLngLat([here.longitude, here.latitude]);
  }, [here]);

  return <div ref={container} className="mangwon-market-map" aria-label={getMangwonUiText(locale).marketMap} />;
}
