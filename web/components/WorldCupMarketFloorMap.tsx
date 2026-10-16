"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "../lib/track";
import type React from "react";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { qrDestinationPath } from "../lib/qrScan";
import { buildFloorMapLayout, fitInlineLabel, fitPlanAffine, locateOnPlan, FLOOR_MAP_COLORS, type FloorPlanLayout, type MyLocationResult } from "../lib/worldCupMarketFloorMap";
import { localizeCategory, localizeCategoryGroup, localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import { WORLD_CUP_MARKET_CATEGORY_GROUP_ORDER, WORLD_CUP_MARKET_STORES, type WorldCupMarketStore } from "../lib/worldCupMarketStores";

export interface WorldCupMarketFloorMapProps {
  readonly stores: readonly WorldCupMarketStore[];
  readonly locale: Locale;
  readonly onSelect: (storeId: string) => void;
  readonly selectedId?: string;
}

/** Phones: both sides of a centre alley, real side and order kept. */
const VERTICAL_PLAN = { margin: 4, alley: 22, stallDepth: 166, stallHeight: 88, street: 24 } as const;
/** Desktop: both sides of the alley, wide blocks. */
const WIDE_PLAN = { margin: 10, alley: 48, stallDepth: 400, stallHeight: 60, street: 32 } as const;
const LABEL_FONT = { max: 30, min: 12 } as const;
const MY_LOCATION_TEXT: Record<Locale, { button: string; locating: string; outside: string; inaccurate: string; denied: string; unavailable: string; privacy: string; shown: string; timeout: string; away: (d: string) => string; acc: (m: number) => string }> = {
  ko: { button: "내 위치", locating: "위치 확인 중…", outside: "시장 밖에 계신 것 같아요.", inaccurate: "위치가 정확하지 않아요. 잠시 후 다시 눌러 주세요.", denied: "위치 권한이 꺼져 있어요.", unavailable: "위치를 가져올 수 없어요.", privacy: "위치는 이 기기에서만 쓰고 저장하거나 보내지 않아요.", shown: "지도에 파란 점으로 표시했어요.", timeout: "위치 확인이 오래 걸려요. 밖이나 창가에서 다시 눌러 주세요.", away: (d) => `시장에서 약 ${d} 떨어져 있어요.`, acc: (m) => `(현재 오차 약 ${m}m)` },
  en: { button: "My location", locating: "Locating…", outside: "You are outside the market.", inaccurate: "Location is inaccurate. Please try again shortly.", denied: "Location permission is off.", unavailable: "Location is unavailable.", privacy: "Your location stays on this device and is never stored or sent.", shown: "Shown as a blue dot on the map.", timeout: "Locating took too long. Try again outdoors or near a window.", away: (d) => `About ${d} from the market.`, acc: (m) => `(accuracy about ${m} m)` },
  ja: { button: "現在地", locating: "現在地を確認中…", outside: "市場の外にいるようです。", inaccurate: "位置情報が不正確です。少し待ってからもう一度お試しください。", denied: "位置情報の許可がオフになっています。", unavailable: "位置情報を取得できません。", privacy: "位置情報はこの端末内でのみ使用し、保存・送信しません。", shown: "地図に青い点で表示しました。", timeout: "位置の取得に時間がかかっています。屋外や窓際でもう一度お試しください。", away: (d) => `市場から約${d}離れています。`, acc: (m) => `（誤差 約${m}m）` },
  zh: { button: "我的位置", locating: "正在定位…", outside: "您似乎不在市场内。", inaccurate: "定位不准确，请稍后再试。", denied: "位置权限已关闭。", unavailable: "无法获取位置。", privacy: "位置仅在本设备上使用，不会保存或发送。", shown: "已在地图上用蓝点显示。", timeout: "定位时间过长，请到室外或窗边再试。", away: (d) => `距市场约${d}。`, acc: (m) => `（误差约${m}米）` },
};
type MyLocState = { kind: "idle" | "locating" | "denied" | "unavailable" | "timeout" } | { kind: "fix"; lat: number; lng: number; acc: number };
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
  const horizontal = useMemo(() => buildFloorMapLayout(stores, WIDE_PLAN), [stores]);
  const layout = vertical;
  const affV = useMemo(() => fitPlanAffine(vertical), [vertical]);
  const affH = useMemo(() => fitPlanAffine(horizontal), [horizontal]);
  const [myLoc, setMyLoc] = useState<MyLocState>({ kind: "idle" });
  const mt = MY_LOCATION_TEXT[locale] ?? MY_LOCATION_TEXT.en;
  const locate = () => {
    track("my_location_click", { locale }); // no coordinates, ever
    if (typeof navigator === "undefined" || !navigator.geolocation) { setMyLoc({ kind: "unavailable" }); return; }
    setMyLoc({ kind: "locating" });
    const ok = (pos: GeolocationPosition) => setMyLoc({ kind: "fix", lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
    const fail = (err: GeolocationPositionError) => setMyLoc({ kind: err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable" });
    // Fresh GPS fix first (10s, no cache: a re-tap after walking must not show the old spot); fallback network location (10s, ≤1 min cache).
    navigator.geolocation.getCurrentPosition(ok, (err) => {
      if (err.code === err.PERMISSION_DENIED) { fail(err); return; }
      navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  };
  const fixV: MyLocationResult | null = myLoc.kind === "fix" ? locateOnPlan(vertical, affV, myLoc.lat, myLoc.lng, myLoc.acc) : null;
  const fixH: MyLocationResult | null = myLoc.kind === "fix" ? locateOnPlan(horizontal, affH, myLoc.lat, myLoc.lng, myLoc.acc) : null;
  const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)}km` : `${Math.max(10, Math.round(m / 10) * 10)}m`);
  const myMsg = myLoc.kind === "locating" ? mt.locating : myLoc.kind === "denied" ? mt.denied : myLoc.kind === "unavailable" ? mt.unavailable
    : myLoc.kind === "timeout" ? mt.timeout
    : fixV?.kind === "outside" ? `${mt.outside} ${mt.away(fmtDist(fixV.distanceM))}`
    : fixV?.kind === "inaccurate" ? `${mt.inaccurate} ${mt.acc(fixV.accuracyM)}`
    : fixV?.kind === "ok" ? mt.shown : null;
  // Bring the dot into view: on phones the map is long and the dot can be off-screen.
  useEffect(() => {
    if (fixV?.kind !== "ok") return;
    const el = [...document.querySelectorAll<SVGGElement>(".wcm-floor-me")].find((g) => g.getBoundingClientRect().width > 0);
    el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [myLoc]); // eslint-disable-line react-hooks/exhaustive-deps
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
        const narrow = s.width < 200, pad = narrow ? 7 : 12; // phone blocks are half-width
        const label = fitInlineLabel(String(s.number ?? ""), name, s.width - pad * 2, narrow ? 24 : LABEL_FONT.max, narrow ? 15 : LABEL_FONT.min);
        return <a key={s.storeId} href={qrDestinationPath(s.storeId)} data-store-id={s.storeId} className={selected ? "is-selected" : undefined}
          aria-label={`${s.number}. ${name} · ${localizeCategory(store.category, locale)} · ${ui.approximateLocation}`}
          onClick={(e) => { e.preventDefault(); onSelect(s.storeId); }}>
          <rect className="wcm-floor-stall" x={s.x} y={s.y} width={s.width} height={s.height} fill={color.fill} />
          {selected ? <rect className="wcm-floor-stall-sel" x={s.x + 1.5} y={s.y + 1.5} width={s.width - 3} height={s.height - 3} /> : null}
          <text className="wcm-floor-label" x={s.x + pad} y={s.y + s.height / 2 + label.fontSize * 0.36} fontSize={label.fontSize}>
            <tspan className="wcm-floor-num">{s.number}</tspan>{label.name ? <tspan dx={label.fontSize * 0.35}>{label.name}</tspan> : null}
          </text>
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
          <span><Arrow angle={layout.northAngle} />{ko ? "북" : "N"}</span>
          {layout.stations.map((s) => <span key={s.id}><Arrow angle={s.angle} />{ko ? s.nameKo : s.nameEn}</span>)}
        </span>)}
      </div>
      <div className="wcm-floor-myloc">
        <button type="button" onClick={locate} disabled={myLoc.kind === "locating"}><span aria-hidden="true">◎</span> {mt.button}</button>
        {myMsg ? <span role="status" className={fixV?.kind === "ok" ? "is-ok" : undefined}>{myMsg}</span> : <span className="is-hint">{mt.privacy}</span>}
      </div>
      <div className="wcm-floor-chips">
        {groups.map((g) => <span key={g}><i style={{ background: FLOOR_MAP_COLORS[g].strong }} />{localizeCategoryGroup(g, locale)}</span>)}
      </div>
      <div className="wcm-floor-plan is-vertical">{renderPlan(vertical, false)}</div>
      <div className="wcm-floor-plan is-horizontal">{renderPlan(horizontal, false)}</div>
      <p className="wcm-floor-note">{ko ? "개략도입니다. 점포 위치와 순서는 주소 기반 추정이며 실측이 아닙니다. 입구·화장실 정보는 아직 없습니다." : ui.mapGuideApproximate}
        {" · "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></p>
    </div>
  );
}
