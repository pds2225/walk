"use client";

import { useMemo } from "react";
import type React from "react";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { qrDestinationPath } from "../lib/qrScan";
import { buildFloorMapLayout, fitStallLabel, FLOOR_MAP_COLORS, type FloorPlanLayout } from "../lib/worldCupMarketFloorMap";
import { localizeCategory, localizeCategoryGroup, localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import { WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER, WORLD_CUP_MARKET_STORES, type WorldCupMarketStore } from "../lib/worldCupMarketStores";

export interface WorldCupMarketFloorMapProps {
  readonly stores: readonly WorldCupMarketStore[];
  readonly locale: Locale;
  readonly onSelect: (storeId: string) => void;
  readonly selectedId?: string;
}

const BADGE_R = 8.5;
const HORIZONTAL_PLAN = { stallHeight: 54, stallDepth: 118, alley: 40, street: 24 } as const;
type Rect = { x: number; y: number; width: number; height: number };

function Arrow({ angle }: { readonly angle: number }) {
  return <svg className="wcm-floor-icon" viewBox="-10 -10 20 20" aria-hidden="true">
    <circle r="9.2" /><g transform={`rotate(${angle.toFixed(1)})`}><path d="M7 0 L-5 -3.6 L-5 3.6 Z" /></g>
  </svg>;
}

/** Department-store style directory plan (schematic, positions approximate). */
export default function WorldCupMarketFloorMap({ stores, locale, onSelect, selectedId = "" }: WorldCupMarketFloorMapProps) {
  const ui = getWorldCupMarketUiText(locale);
  const vertical = useMemo(() => buildFloorMapLayout(stores), [stores]);
  // Wide screens: same plan rotated so the alley runs left→right (west-ish end on the left).
  const horizontal = useMemo(() => buildFloorMapLayout(stores, HORIZONTAL_PLAN), [stores]);
  const layout = vertical;
  const byId = new Map(stores.map((s) => [s.id, s]));
  const ko = locale === "ko";
  const groups = WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER.filter((g) => WORLD_CUP_MARKET_STORES.some((s) => s.categoryGroup === g));
  const title = ko ? "망원동 월드컵시장" : ui.market;
  const alleyLabel = `망원로7길 · ${ko ? "시장 골목" : "market alley"}`;

  function renderPlan(plan: FloorPlanLayout, rotated: boolean) {
    // Rotation by -90°: plan "down" becomes screen "right", plan "left" becomes screen "bottom".
    const W = plan.width;
    const R = (r: Rect): Rect => (rotated ? { x: r.y, y: W - r.x - r.width, width: r.height, height: r.width } : r);
    const vbW = rotated ? plan.height : plan.width, vbH = rotated ? plan.width : plan.height;
    const alley = R({ x: plan.alley.x, y: 0, width: plan.alley.width, height: plan.height });
    return <svg className="wcm-floor-svg" viewBox={`0 0 ${vbW} ${vbH}`} role="group" aria-label={ui.marketMap}>
      {plan.buildings.map((b, i) => { const r = R(b); return <rect key={`b${i}`} x={r.x} y={r.y} width={r.width} height={r.height} rx="4" fill="#e1e4e8" />; })}
      <rect {...alley} fill="#fff" stroke="#e1e4e8" strokeWidth="1" />
      {plan.cuts.map((c, i) => {
        const x0 = c.left ? 0 : plan.alley.x, x1 = c.right ? plan.width : plan.alley.x + plan.alley.width;
        const r = R({ x: x0, y: c.y - plan.street / 2, width: x1 - x0, height: plan.street });
        const tx = rotated ? c.y : (c.right ? plan.alley.x + plan.alley.width + 8 : 8);
        return <g key={`c${i}`}><rect {...r} fill="#fff" />
          {c.name ? (rotated
            ? <text className="wcm-floor-street" textAnchor="middle" transform={`translate(${tx + 3} ${c.right ? 10 : vbH - 6}) rotate(-90)`}>{c.name}</text>
            : <text className="wcm-floor-street" x={tx} y={c.y + 3}>{c.name}</text>) : null}
        </g>;
      })}
      {rotated
        ? <text className="wcm-floor-street is-alley" x={vbW / 2} y={alley.y + alley.height / 2 + 3.5}>{alleyLabel}</text>
        : <text className="wcm-floor-street is-alley is-upright" x={alley.x + alley.width / 2} y={plan.height / 2}>{alleyLabel.replace(/ · /, " ")}</text>}
      {plan.stalls.map((s0) => {
        const s = { ...s0, ...R(s0) };
        const store = byId.get(s.storeId)!;
        const name = localizeStoreName(store, locale);
        const selected = s.storeId === selectedId;
        const color = FLOOR_MAP_COLORS[s.group];
        let badge: { x: number; y: number }, nameEl: React.ReactNode = null;
        if (rotated) {
          // Badge on top, name centred below (wraps to 2 lines).
          const label = fitStallLabel(name, s.width - 6, s.height - BADGE_R * 2 - 12);
          badge = label ? { x: s.x + s.width / 2, y: s.y + 6 + BADGE_R } : { x: s.x + s.width / 2, y: s.y + s.height / 2 };
          if (label) {
            const top = s.y + 10 + BADGE_R * 2 + (s.height - 10 - BADGE_R * 2) / 2 - (label.lines.length - 1) * label.fontSize * 0.575;
            nameEl = <text className="wcm-floor-name" textAnchor="middle" fontSize={label.fontSize}>
              {label.lines.map((line, i) => <tspan key={i} x={s.x + s.width / 2} y={top + i * label.fontSize * 1.15 + label.fontSize * 0.36}>{line}</tspan>)}
            </text>;
          }
        } else {
          const label = fitStallLabel(name, s.width - BADGE_R * 2 - 16, s.height - 6);
          const cy = s.y + s.height / 2;
          badge = { x: label ? s.x + 6 + BADGE_R : s.x + s.width / 2, y: cy };
          if (label) nameEl = <text className="wcm-floor-name" x={s.x + 12 + BADGE_R * 2} y={cy} fontSize={label.fontSize}>
            {label.lines.map((line, i) => <tspan key={i} x={s.x + 12 + BADGE_R * 2}
              dy={i === 0 ? (label.lines.length === 1 ? label.fontSize * 0.36 : -label.fontSize * 0.24) : label.fontSize * 1.15}>{line}</tspan>)}
          </text>;
        }
        return <a key={s.storeId} href={qrDestinationPath(s.storeId)} data-store-id={s.storeId} className={selected ? "is-selected" : undefined}
          aria-label={`${s.number}. ${name} · ${localizeCategory(store.category, locale)} · ${ui.approximateLocation}`}
          onClick={(e) => { e.preventDefault(); onSelect(s.storeId); }}>
          <rect className="wcm-floor-stall" x={s.x} y={s.y} width={s.width} height={s.height} fill={color.fill} />
          {selected ? <rect className="wcm-floor-stall-sel" x={s.x + 1.5} y={s.y + 1.5} width={s.width - 3} height={s.height - 3} /> : null}
          <circle cx={badge.x} cy={badge.y} r={BADGE_R} fill={color.strong} />
          <text className="wcm-floor-badge" x={badge.x} y={badge.y + 3.2}>{s.number}</text>
          {nameEl}
        </a>;
      })}
    </svg>;
  }
  return (
    <div className="wcm-floor" data-map-provider="floor">
      <div className="wcm-floor-head">
        <h2>{title}</h2>
        <p>{ko ? "시장 안내도" : "Market directory"}</p>
      </div>
      <div className="wcm-floor-legend">
        {[false, true].map((rot) => <span key={String(rot)} className={`wcm-floor-dirs ${rot ? "is-horizontal" : "is-vertical"}`}>
          <span><Arrow angle={layout.northAngle - (rot ? 90 : 0)} />{ko ? "북" : "N"}</span>
          {layout.stations.map((s) => <span key={s.id}><Arrow angle={s.angle - (rot ? 90 : 0)} />{ko ? s.nameKo : s.nameEn}</span>)}
        </span>)}
      </div>
      <div className="wcm-floor-chips">
        {groups.map((g) => <span key={g}><i style={{ background: FLOOR_MAP_COLORS[g].strong }} />{localizeCategoryGroup(g, locale)}</span>)}
      </div>
      <div className="wcm-floor-plan is-vertical">{renderPlan(vertical, false)}</div>
      <div className="wcm-floor-plan is-horizontal">{renderPlan(horizontal, true)}</div>
      <p className="wcm-floor-note">{ko ? "개략도입니다. 점포 위치와 순서는 주소 기반 추정이며 실측이 아닙니다. 입구·화장실 정보는 아직 없습니다." : ui.mapGuideApproximate}
        {" · "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></p>
    </div>
  );
}
