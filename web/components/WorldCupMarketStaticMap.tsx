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
  /** overview: market home. detail: store "위치" block, selected store highlighted. */
  readonly mode?: "overview" | "detail";
}

/**
 * 고정 시장 안내도 이미지 + 점포 번호 핀(이미지 기준 % 좌표라 항상 이미지와 함께 움직인다).
 * 첫 화면과 상세 "위치" 블록 모두 사용. 외부 지도 SDK를 불러오지 않는다.
 * 실시간 NAVER 지도는 NEXT_PUBLIC_WORLDCUP_LIVE_MAP=true 일 때만 쓴다.
 */
export default function WorldCupMarketStaticMap({ stores, selectedId, onSelect, locale, mode = "overview" }: WorldCupMarketStaticMapProps) {
  const ui = getWorldCupMarketUiText(locale);
  const config = WORLD_CUP_MARKET_STATIC_MAP;
  const byId = new Map(stores.map((store) => [store.id, store]));
  const pins = layoutWorldCupMarketStaticMapPins(stores.map((store) => store.id), config);
  return (
    <div className="worldcup-market-market-map" role="region" aria-label={ui.marketMap} data-map-provider="static" data-map-mode={mode}
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
      <p className="worldcup-market-static-map-caption">{ui.mapGuideApproximate}</p>
      <a className="worldcup-market-static-map-attribution" href={config.attribution.href} target="_blank" rel="noopener noreferrer">
        {config.attribution.label}
      </a>
    </div>
  );
}
