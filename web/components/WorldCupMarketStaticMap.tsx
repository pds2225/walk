"use client";

import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { getWorldCupMarketMapPlacement } from "../lib/worldCupMarketMapLayout";
import { layoutWorldCupMarketStaticMapPins, WORLD_CUP_MARKET_STATIC_MAP } from "../lib/worldCupMarketStaticMap";
import { localizeCategory, localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import type { WorldCupMarketStore } from "../lib/worldCupMarketStores";

export interface WorldCupMarketStaticMapProps {
  readonly stores: readonly WorldCupMarketStore[];
  readonly selectedId: string;
  readonly onSelect: (storeId: string) => void;
  readonly locale: Locale;
}

/** 첫 화면용 고정 지도 이미지 + 점포 핀. 외부 지도 SDK를 불러오지 않는다. */
export default function WorldCupMarketStaticMap({ stores, selectedId, onSelect, locale }: WorldCupMarketStaticMapProps) {
  const ui = getWorldCupMarketUiText(locale);
  const config = WORLD_CUP_MARKET_STATIC_MAP;
  const byId = new Map(stores.map((store) => [store.id, store]));
  const pins = layoutWorldCupMarketStaticMapPins(stores.map((store) => store.id), config);
  return (
    <div className="worldcup-market-market-map" role="region" aria-label={ui.marketMap} data-map-provider="static" data-map-mode="overview"
      style={{ aspectRatio: `${config.width} / ${config.height}` }}>
      <img className="worldcup-market-static-map-image" src={config.src} alt="" width={config.width} height={config.height} decoding="async" />
      <div className="worldcup-market-map-overlay">
        <svg className="worldcup-market-map-leaders" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {pins.map((pin) => <line key={pin.storeId} x1={pin.anchorX} y1={pin.anchorY} x2={pin.x} y2={pin.y} vectorEffect="non-scaling-stroke" />)}
        </svg>
        {pins.map((pin) => {
          const store = byId.get(pin.storeId);
          if (!store) return null;
          const approximate = getWorldCupMarketMapPlacement(store.id)?.approximate ?? false;
          const label = `${localizeStoreName(store, locale)} · ${localizeCategory(store.category, locale)}${approximate ? ` · ${ui.approximateLocation}` : ""}`;
          return <button key={store.id} type="button"
            className={`worldcup-market-overview-pin${selectedId === store.id ? " is-selected" : ""}`}
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            data-store-id={store.id} data-approximate={approximate}
            aria-label={`${label} · ${ui.selectOnMap}`} aria-pressed={selectedId === store.id} title={label}
            onClick={() => onSelect(store.id)}>
            {store.corridorOrder}
          </button>;
        })}
      </div>
      <a className="worldcup-market-static-map-attribution" href={config.attribution.href} target="_blank" rel="noopener noreferrer">
        {config.attribution.label}
      </a>
    </div>
  );
}
