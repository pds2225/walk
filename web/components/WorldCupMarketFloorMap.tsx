"use client";

import { useMemo, useState } from "react";
import { track } from "../lib/track";
import type React from "react";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { qrDestinationPath } from "../lib/qrScan";
import { buildFloorMapLayout, fitPlanAffine, locateOnPlan, FLOOR_MAP_COLORS, type FloorPlanLayout, type MyLocationResult } from "../lib/worldCupMarketFloorMap";
import { localizeCategory, localizeCategoryGroup, localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import { WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER, WORLD_CUP_MARKET_STORES, type WorldCupMarketStore } from "../lib/worldCupMarketStores";

export interface WorldCupMarketFloorMapProps {
  readonly stores: readonly WorldCupMarketStore[];
  readonly locale: Locale;
  readonly onSelect: (storeId: string) => void;
  readonly selectedId?: string;
}

const VERTICAL_PLAN = { stallHeight: 26, stallDepth: 64, alley: 40, street: 22 } as const;
const HORIZONTAL_PLAN = { stallHeight: 30, stallDepth: 52, alley: 32, street: 20 } as const;
/** Plan-unit font sizes; both render ≥14px (mobile svg ≈1.4×, desktop ≈1100/plan width). */
const NUMBER_FONT = { vertical: 15, horizontal: 16 } as const;
const MY_LOCATION_TEXT: Record<Locale, { button: string; locating: string; outside: string; inaccurate: string; denied: string; unavailable: string; privacy: string }> = {
  ko: { button: "내 위치", locating: "위치 확인 중…", outside: "시장 밖에 계신 것 같아요.", inaccurate: "위치가 정확하지 않아요. 잠시 후 다시 눌러 주세요.", denied: "위치 권한이 거부됐어요. 브라우저 설정에서 허용해 주세요.", unavailable: "위치를 가져올 수 없어요.", privacy: "위치는 이 기기에서만 쓰고 저장하거나 보내지 않아요." },
  en: { button: "My location", locating: "Locating…", outside: "You are outside the market.", inaccurate: "Location is inaccurate. Please try again shortly.", denied: "Location permission was denied. Allow it in your browser settings.", unavailable: "Location is unavailable.", privacy: "Your location stays on this device and is never stored or sent." },
  ja: { button: "現在地", locating: "現在地を確認中…", outside: "市場の外にいるようです。", inaccurate: "位置情報が不正確です。少し待ってからもう一度お試しください。", denied: "位置情報の許可が拒否されました。ブラウザの設定で許可してください。", unavailable: "位置情報を取得できません。", privacy: "位置情報はこの端末内でのみ使用し、保存・送信しません。" },
  zh: { button: "我的位置", locating: "正在定位…", outside: "您似乎不在市场内。", inaccurate: "定位不准确，请稍后再试。", denied: "位置权限被拒绝，请在浏览器设置中允许。", unavailable: "无法获取位置。", privacy: "位置仅在本设备上使用，不会保存或发送。" },
};
type MyLocState = { kind: "idle" | "locating" | "denied" | "unavailable" } | { kind: "fix"; lat: number; lng: number; acc: number };
type Rect = { x: number; y: number; width: number; height: number };

function Arrow({ angle }: { readonly angle: number }) {
  return <svg className="wcm-floor-icon" viewBox="-10 -10 20 20" aria-hidden="true">
    <circle r="9.2" /><g transform={`rotate(${angle.toFixed(1)})`}><path d="M7 0 L-5 -3.6 L-5 3.6 Z" /></g>
  </svg>;
}

/** Department-store style directory plan (schematic, positions approximate). */
export default function WorldCupMarketFloorMap({ stores, locale, onSelect, selectedId = "" }: WorldCupMarketFloorMapProps) {
  const ui = getWorldCupMarketUiText(locale);
  const vertical = useMemo(() => buildFloorMapLayout(stores, VERTICAL_PLAN), [stores]);
  // Wide screens: same plan rotated so the alley runs left→right (west-ish end on the left).
  const horizontal = useMemo(() => buildFloorMapLayout(stores, HORIZONTAL_PLAN), [stores]);
  const layout = vertical;
  const affV = useMemo(() => fitPlanAffine(vertical), [vertical]);
  const affH = useMemo(() => fitPlanAffine(horizontal), [horizontal]);
  const [myLoc, setMyLoc] = useState<MyLocState>({ kind: "idle" });
  const mt = MY_LOCATION_TEXT[locale] ?? MY_LOCATION_TEXT.en;
  const locate = () => {
    track("my_location_click", { locale }); // no coordinates, ever
    if (typeof navigator === "undefined" || !navigator.geolocation) { setMyLoc({ kind: "unavailable" }); return; }
    setMyLoc({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => setMyLoc({ kind: "fix", lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      (err) => setMyLoc({ kind: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };
  const fixV: MyLocationResult | null = myLoc.kind === "fix" ? locateOnPlan(vertical, affV, myLoc.lat, myLoc.lng, myLoc.acc) : null;
  const fixH: MyLocationResult | null = myLoc.kind === "fix" ? locateOnPlan(horizontal, affH, myLoc.lat, myLoc.lng, myLoc.acc) : null;
  const myMsg = myLoc.kind === "locating" ? mt.locating : myLoc.kind === "denied" ? mt.denied : myLoc.kind === "unavailable" ? mt.unavailable
    : fixV && fixV.kind !== "ok" ? mt[fixV.kind] : null;
  const byId = new Map(stores.map((s) => [s.id, s]));
  const ko = locale === "ko";
  const groups = WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER.filter((g) => WORLD_CUP_MARKET_STORES.some((s) => s.categoryGroup === g));
  const title = ko ? "망원동 월드컵시장" : ui.market;
  const alleyLabel = `망원로7길 · ${ko ? "시장 골목" : "market alley"}`;

  function renderPlan(plan: FloorPlanLayout, rotated: boolean) {
    const fix = rotated ? fixH : fixV;
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
        // Numbers only (COEX style): large, bold, centred. Names live in the index below.
        const fs = rotated ? NUMBER_FONT.horizontal : NUMBER_FONT.vertical;
        return <a key={s.storeId} href={qrDestinationPath(s.storeId)} data-store-id={s.storeId} className={selected ? "is-selected" : undefined}
          aria-label={`${s.number}. ${name} · ${localizeCategory(store.category, locale)} · ${ui.approximateLocation}`}
          onClick={(e) => { e.preventDefault(); onSelect(s.storeId); }}>
          <rect className="wcm-floor-stall" x={s.x} y={s.y} width={s.width} height={s.height} fill={color.fill} />
          {selected ? <rect className="wcm-floor-stall-sel" x={s.x + 1.5} y={s.y + 1.5} width={s.width - 3} height={s.height - 3} /> : null}
          <text className="wcm-floor-num" x={s.x + s.width / 2} y={s.y + s.height / 2 + fs * 0.36} fontSize={fs}>{s.number}</text>
        </a>;
      })}
      {fix && fix.kind === "ok" ? (() => { const cx = rotated ? fix.y : fix.x, cy = rotated ? W - fix.x : fix.y;
        return <g className="wcm-floor-me" pointerEvents="none" aria-label={mt.button}>
          <circle cx={cx} cy={cy} r={fix.radius} fill="rgba(33,150,243,.16)" stroke="rgba(33,150,243,.5)" strokeWidth="1" />
          <circle cx={cx} cy={cy} r="6.5" fill="#1e88e5" stroke="#fff" strokeWidth="2.5" />
        </g>; })() : null}
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
      <div className="wcm-floor-myloc">
        <button type="button" onClick={locate} disabled={myLoc.kind === "locating"}><span aria-hidden="true">◎</span> {mt.button}</button>
        {myMsg ? <span role="status">{myMsg}</span> : <span className="is-hint">{mt.privacy}</span>}
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
