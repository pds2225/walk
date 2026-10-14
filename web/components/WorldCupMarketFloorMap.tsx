"use client";

import { useMemo } from "react";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { qrDestinationPath } from "../lib/qrScan";
import { buildFloorMapLayout, FLOOR_MAP_BLOCK, FLOOR_MAP_COLORS, MARKET_STREET } from "../lib/worldCupMarketFloorMap";
import { localizeCategory, localizeCategoryGroup, localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import { WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER, type WorldCupMarketStore } from "../lib/worldCupMarketStores";

export interface WorldCupMarketFloorMapProps {
  readonly stores: readonly WorldCupMarketStore[];
  readonly locale: Locale;
  readonly onSelect: (storeId: string) => void;
}


/** Mall-directory style plan: OSM streets + category-coloured store blocks (approximate). */
export default function WorldCupMarketFloorMap({ stores, locale, onSelect }: WorldCupMarketFloorMapProps) {
  const ui = getWorldCupMarketUiText(locale);
  const layout = useMemo(() => buildFloorMapLayout(stores), [stores]);
  const byId = new Map(stores.map((s) => [s.id, s]));
  const { width: bw, height: bh } = FLOOR_MAP_BLOCK;
  const groups = WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER.filter((g) => stores.some((s) => s.categoryGroup === g));
  const ko = locale === "ko";
  const click = (id: string) => (event: React.MouseEvent) => { event.preventDefault(); onSelect(id); };
  return (
    <div className="wcm-floor" data-map-provider="floor">
      <div className="wcm-floor-badges"><span>{ko ? "개략도 · 실측 아님" : "Approximate plan · not surveyed"}</span></div>
      <svg className="wcm-floor-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label={ui.marketMap}>
        <rect width={layout.width} height={layout.height} fill="#f4f1ea" />
        {layout.streets.map((s) => <path key={`c${s.id}`} d={s.d} className={`wcm-floor-road is-${s.kind}${s.name === MARKET_STREET ? " is-market" : ""}`} />)}
        {layout.streets.map((s) => s.labelAt && s.name ? <text key={`l${s.id}`} className="wcm-floor-road-label" transform={`translate(${s.labelAt.x} ${s.labelAt.y}) rotate(${s.labelAt.angle})`}>{s.name}</text> : null)}
        {layout.blocks.map((b) => Math.hypot(b.x - b.anchorX, b.y - b.anchorY) > 6
          ? <g key={`a${b.storeId}`} className="wcm-floor-leader"><line x1={b.anchorX} y1={b.anchorY} x2={b.x} y2={b.y} /><circle cx={b.anchorX} cy={b.anchorY} r={1.6} /></g> : null)}
        {layout.blocks.map((b) => {
          const store = byId.get(b.storeId)!;
          const name = localizeStoreName(store, locale);
          const showName = ko && name.length <= 4;
          return <a key={b.storeId} href={qrDestinationPath(b.storeId)} onClick={click(b.storeId)} data-store-id={b.storeId}
            aria-label={`${b.number}. ${name} · ${localizeCategory(store.category, locale)} · ${ui.approximateLocation}`}>
            <rect x={b.x - bw / 2} y={b.y - bh / 2} width={bw} height={bh} rx={4} fill={FLOOR_MAP_COLORS[b.group]} className="wcm-floor-block" />
            <text x={b.x} y={showName ? b.y - 2 : b.y + 4} className="wcm-floor-num">{b.number}</text>
            {showName ? <text x={b.x} y={b.y + 10} className="wcm-floor-name">{name}</text> : null}
          </a>;
        })}
        {layout.stations.map((st) => <g key={st.id} className="wcm-floor-station" transform={`translate(${st.x} ${st.y})`}>
          <g transform={`rotate(${st.angle})`}><path d="M10 0 L-6 -8 L-6 8 Z" /></g>
          <rect x={-46} y={8} width={92} height={15} rx={7.5} />
          <text y={18.5}>🚇 {ko ? st.nameKo : st.nameEn}</text>
        </g>)}
        <g className="wcm-floor-compass" transform={`translate(${layout.width - 18} 18)`}><circle r={11} /><text y={4}>N</text></g>
      </svg>
      <p className="worldcup-market-static-map-caption">{ui.mapGuideApproximate}</p>
      <p className="wcm-floor-attrib">{ko ? "도로: " : "Streets: "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></p>
      <div className="wcm-floor-index" aria-label={ui.storeList}>
        {groups.map((g) => <section key={g}>
          <h3 style={{ background: FLOOR_MAP_COLORS[g] }}>{localizeCategoryGroup(g, locale)}</h3>
          <ul>{stores.filter((s) => s.categoryGroup === g).sort((l, r) => (l.corridorOrder ?? 0) - (r.corridorOrder ?? 0)).map((s) =>
            <li key={s.id}><a href={qrDestinationPath(s.id)} onClick={click(s.id)}>
              <span style={{ background: FLOOR_MAP_COLORS[g] }}>{s.corridorOrder}</span>{localizeStoreName(s, locale)}</a></li>)}</ul>
        </section>)}
      </div>
    </div>
  );
}
