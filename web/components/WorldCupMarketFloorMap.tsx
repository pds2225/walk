"use client";

import { useMemo } from "react";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { qrDestinationPath } from "../lib/qrScan";
import { buildFloorMapLayout, fitStallLabel, FLOOR_MAP_COLORS } from "../lib/worldCupMarketFloorMap";
import { localizeCategory, localizeCategoryGroup, localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import { WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER, WORLD_CUP_MARKET_STORES, type WorldCupMarketStore } from "../lib/worldCupMarketStores";

export interface WorldCupMarketFloorMapProps {
  readonly stores: readonly WorldCupMarketStore[];
  readonly locale: Locale;
  readonly onSelect: (storeId: string) => void;
  readonly selectedId?: string;
}

const BADGE_R = 8.5;

function Arrow({ angle }: { readonly angle: number }) {
  return <svg className="wcm-floor-icon" viewBox="-10 -10 20 20" aria-hidden="true">
    <circle r="9.2" /><g transform={`rotate(${angle.toFixed(1)})`}><path d="M7 0 L-5 -3.6 L-5 3.6 Z" /></g>
  </svg>;
}

/** Department-store style directory plan (schematic, positions approximate). */
export default function WorldCupMarketFloorMap({ stores, locale, onSelect, selectedId = "" }: WorldCupMarketFloorMapProps) {
  const ui = getWorldCupMarketUiText(locale);
  const layout = useMemo(() => buildFloorMapLayout(stores), [stores]);
  const byId = new Map(stores.map((s) => [s.id, s]));
  const ko = locale === "ko";
  const groups = WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER.filter((g) => WORLD_CUP_MARKET_STORES.some((s) => s.categoryGroup === g));
  const title = ko ? "망원동 월드컵시장" : ui.market;
  return (
    <div className="wcm-floor" data-map-provider="floor">
      <div className="wcm-floor-head">
        <h2>{title}</h2>
        <p>{ko ? "시장 안내도" : "Market directory"}</p>
      </div>
      <div className="wcm-floor-legend">
        <span><Arrow angle={layout.northAngle} />{ko ? "북" : "N"}</span>
        {layout.stations.map((s) => <span key={s.id}><Arrow angle={s.angle} />{ko ? s.nameKo : s.nameEn}</span>)}
      </div>
      <div className="wcm-floor-chips">
        {groups.map((g) => <span key={g}><i style={{ background: FLOOR_MAP_COLORS[g].strong }} />{localizeCategoryGroup(g, locale)}</span>)}
      </div>
      <svg className="wcm-floor-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label={ui.marketMap}>
        <rect width={layout.width} height={layout.height} rx="14" fill="#eceef1" />
        {layout.buildings.map((b, i) => <rect key={`b${i}`} x={b.x} y={b.y} width={b.width} height={b.height} fill="#dfe2e6" />)}
        <rect x={layout.alley.x} y={0} width={layout.alley.width} height={layout.height} fill="#fff" />
        {layout.cuts.map((c, i) => <g key={`c${i}`}>
          <rect x={c.left ? 0 : layout.alley.x} y={c.y - 15} width={(c.left ? layout.alley.x : 0) + layout.alley.width + (c.right ? layout.width - layout.alley.x - layout.alley.width : 0)} height={30} fill="#fff" />
          {c.name ? <text className="wcm-floor-street" x={c.right ? layout.alley.x + layout.alley.width + 8 : 8} y={c.y + 3}>{c.name}</text> : null}
        </g>)}
        <text className="wcm-floor-street is-alley" transform={`translate(${layout.alley.x + layout.alley.width / 2} ${layout.height / 2}) rotate(-90)`}>망원로7길 · {ko ? "시장 골목" : "market alley"}</text>
        {layout.stalls.map((s) => {
          const store = byId.get(s.storeId)!;
          const name = localizeStoreName(store, locale);
          const selected = s.storeId === selectedId;
          const label = fitStallLabel(name, s.width - BADGE_R * 2 - 16, s.height - 6);
          const cy = s.y + s.height / 2;
          const color = FLOOR_MAP_COLORS[s.group];
          return <a key={s.storeId} href={qrDestinationPath(s.storeId)} data-store-id={s.storeId} className={selected ? "is-selected" : undefined}
            aria-label={`${s.number}. ${name} · ${localizeCategory(store.category, locale)} · ${ui.approximateLocation}`}
            onClick={(e) => { e.preventDefault(); onSelect(s.storeId); }}>
            <rect className="wcm-floor-stall" x={s.x} y={s.y} width={s.width} height={s.height} fill={color.fill} />
            {selected ? <rect className="wcm-floor-stall-sel" x={s.x + 1.5} y={s.y + 1.5} width={s.width - 3} height={s.height - 3} /> : null}
            <circle cx={label ? s.x + 6 + BADGE_R : s.x + s.width / 2} cy={cy} r={BADGE_R} fill={color.strong} />
            <text className="wcm-floor-badge" x={label ? s.x + 6 + BADGE_R : s.x + s.width / 2} y={cy + 3.2}>{s.number}</text>
            {label ? <text className="wcm-floor-name" x={s.x + 12 + BADGE_R * 2} y={cy} fontSize={label.fontSize}>
              {label.lines.map((line, i) => <tspan key={i} x={s.x + 12 + BADGE_R * 2}
                dy={i === 0 ? (label.lines.length === 1 ? label.fontSize * 0.36 : -label.fontSize * 0.24) : label.fontSize * 1.15}>{line}</tspan>)}
            </text> : null}
          </a>;
        })}
      </svg>
      <p className="wcm-floor-note">{ko ? "개략도입니다. 점포 위치와 순서는 주소 기반 추정이며 실측이 아닙니다. 입구·화장실 정보는 아직 없습니다." : ui.mapGuideApproximate}
        {" · "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></p>
    </div>
  );
}
