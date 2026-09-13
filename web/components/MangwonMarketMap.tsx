"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
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
  readonly locale: "ko" | "en" | "ja" | "zh";
}

function markerLabel(store: MangwonStore, locale: MangwonMarketMapProps["locale"]): string {
  return locale === "ko" ? store.nameKo : `${store.nameKo} · ${store.category}`;
}

function makeStoreMarker(store: MangwonStore, locale: MangwonMarketMapProps["locale"], onSelect: (id: string) => void): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "mangwon-map-marker-wrap";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mangwon-map-marker";
  button.setAttribute("aria-label", `${markerLabel(store, locale)} 지도에서 선택`);
  const image = store.storeImages[0];
  button.innerHTML = `${image ? `<img class="mangwon-map-marker-image" src="${image.url}" alt="" />` : ""}<span class="mangwon-map-marker-copy"><strong class="mangwon-map-marker-name">${store.nameKo}</strong><small>${store.category}</small></span><span class="mangwon-map-pin" aria-hidden="true">●</span>`;
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

  return <div ref={container} className="mangwon-market-map" aria-label="망원시장 실제 지도" />;
}
