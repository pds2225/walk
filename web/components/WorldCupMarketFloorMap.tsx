"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "../lib/track";
import type React from "react";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { qrDestinationPath } from "../lib/qrScan";
import { consentedPosition, getGeoConsent, GEO_CONSENT_TEXT, PRIVACY_POLICY_PATH, rememberFix, setGeoConsent } from "../lib/wcmGeoConsent";
import { buildFloorMapLayout, fitInlineLabel, fitPlanAffine, locateOnPlan, FLOOR_MAP_COLORS, type FloorPlanLayout, type MyLocationResult } from "../lib/worldCupMarketFloorMap";
import { localizeCategory, localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import { type WorldCupMarketStore } from "../lib/worldCupMarketStores";

export interface WorldCupMarketFloorMapProps {
  readonly stores: readonly WorldCupMarketStore[];
  readonly locale: Locale;
  readonly onSelect: (storeId: string) => void;
  readonly selectedId?: string;
  /** "detail": plan only (no title/legend/my-location), scrollable, selected store in red and scrolled into view. */
  readonly variant?: "overview" | "detail";
  /** Category filter: these stores are emphasised; all stores stay drawn in colour. */
  readonly highlightIds?: ReadonlySet<string> | null;
}

/** Phones: both sides of a centre alley, real side and order kept. */
const VERTICAL_PLAN = { margin: 4, alley: 55, stallDepth: 150, stallHeight: 88, street: 24 } as const;
/** Desktop: both sides of the alley, wide blocks. */
const WIDE_PLAN = { margin: 10, alley: 120, stallDepth: 364, stallHeight: 60, street: 32 } as const;
const LABEL_FONT = { max: 30, min: 12 } as const;
const MY_LOCATION_TEXT: Record<Locale, { button: string; locating: string; outside: string; inaccurate: string; denied: string; unavailable: string; shown: string; timeout: string; away: (d: string) => string; acc: (m: number) => string }> = {
  ko: { button: "내 위치", locating: "위치 확인 중…", outside: "시장 밖에 계신 것 같아요.", inaccurate: "위치가 정확하지 않아요. 잠시 후 다시 눌러 주세요.", denied: "위치 권한이 꺼져 있어요.", unavailable: "위치를 가져올 수 없어요.", shown: "지도에 파란 점으로 표시했어요.", timeout: "위치 확인이 오래 걸려요. 밖이나 창가에서 다시 눌러 주세요.", away: (d) => `시장에서 약 ${d} 떨어져 있어요.`, acc: (m) => `(현재 오차 약 ${m}m)` },
  en: { button: "My location", locating: "Locating…", outside: "You are outside the market.", inaccurate: "Location is inaccurate. Please try again shortly.", denied: "Location permission is off.", unavailable: "Location is unavailable.", shown: "Shown as a blue dot on the map.", timeout: "Locating took too long. Try again outdoors or near a window.", away: (d) => `About ${d} from the market.`, acc: (m) => `(accuracy about ${m} m)` },
  ja: { button: "現在地", locating: "現在地を確認中…", outside: "市場の外にいるようです。", inaccurate: "位置情報が不正確です。少し待ってからもう一度お試しください。", denied: "位置情報の許可がオフになっています。", unavailable: "位置情報を取得できません。", shown: "地図に青い点で表示しました。", timeout: "位置の取得に時間がかかっています。屋外や窓際でもう一度お試しください。", away: (d) => `市場から約${d}離れています。`, acc: (m) => `（誤差 約${m}m）` },
  zh: { button: "我的位置", locating: "正在定位…", outside: "您似乎不在市场内。", inaccurate: "定位不准确，请稍后再试。", denied: "位置权限已关闭。", unavailable: "无法获取位置。", shown: "已在地图上用蓝点显示。", timeout: "定位时间过长，请到室外或窗边再试。", away: (d) => `距市场约${d}。`, acc: (m) => `（误差约${m}米）` },
};
type MyLocState = { kind: "idle" | "locating" | "denied" | "unavailable" | "timeout" } | { kind: "fix"; lat: number; lng: number; acc: number };
type Rect = { x: number; y: number; width: number; height: number };

/** Department-store style directory plan (schematic, positions approximate). */
export default function WorldCupMarketFloorMap({ stores, locale, onSelect, selectedId = "", variant = "overview", highlightIds = null }: WorldCupMarketFloorMapProps) {
  const detail = variant === "detail";
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!detail || !selectedId) return;
    for (const box of rootRef.current?.querySelectorAll<HTMLDivElement>(".wcm-floor-plan") ?? []) {
      const el = box.querySelector<SVGGraphicsElement>(`a[data-store-id="${selectedId}"]`);
      if (!el || box.clientHeight === 0) continue;
      const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
      box.scrollTop += r.top - b.top - (box.clientHeight - r.height) / 2;
    }
  }, [detail, selectedId]);
  const [mapOnScreen, setMapOnScreen] = useState(true);
  useEffect(() => {
    if (detail || typeof IntersectionObserver === "undefined") return;
    const plans = [...(rootRef.current?.querySelectorAll(".wcm-floor-plan") ?? [])];
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target, e.isIntersecting);
      setMapOnScreen([...seen.values()].some(Boolean));
    });
    plans.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [detail]);
  // Filtering must not move the page (Dasom 2026-10-16): no auto-scroll on highlight change.
  const ui = getWorldCupMarketUiText(locale);
  const vertical = useMemo(() => buildFloorMapLayout(stores, VERTICAL_PLAN), [stores]);
  // Wide screens: same plan rotated so the alley runs left→right (west-ish end on the left).
  const horizontal = useMemo(() => buildFloorMapLayout(stores, WIDE_PLAN), [stores]);
  const layout = vertical;
  const affV = useMemo(() => fitPlanAffine(vertical), [vertical]);
  const affH = useMemo(() => fitPlanAffine(horizontal), [horizontal]);
  const [myLoc, setMyLoc] = useState<MyLocState>({ kind: "idle" });
  const mt = MY_LOCATION_TEXT[locale] ?? MY_LOCATION_TEXT.en;
  // Location storage needs consent: asked once on the first fix; decline = nothing sent.
  const [askConsent, setAskConsent] = useState<null | "auto" | "button">(null);
  const sendFix = (src: "auto" | "button") => {
    const position = consentedPosition();
    if (position) track("location_fix", { locale, src, position, geoConsent: true });
  };
  const onFix = (fix: { latitude: number; longitude: number; accuracyMeters: number | null }, src: "auto" | "button") => {
    rememberFix(fix);
    const consent = getGeoConsent();
    if (consent === null) setAskConsent(src);
    else if (consent === "yes") sendFix(src);
  };
  const answerConsent = (yes: boolean) => {
    setGeoConsent(yes ? "yes" : "no");
    if (yes && askConsent) sendFix(askConsent);
    setAskConsent(null);
  };
  const ct = GEO_CONSENT_TEXT[locale] ?? GEO_CONSENT_TEXT.en;
  // Only a button tap scrolls the page to the dot; the automatic locate on load must not move the page.
  const manualLocateRef = useRef(false);
  const locate = (manual = true) => {
    manualLocateRef.current = manual;
    if (manual) track("my_location_click", { locale }); // no coordinates, ever
    if (typeof navigator === "undefined" || !navigator.geolocation) { setMyLoc({ kind: "unavailable" }); return; }
    setMyLoc({ kind: "locating" });
    const ok = (pos: GeolocationPosition) => {
      setMyLoc({ kind: "fix", lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
      onFix({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyMeters: pos.coords.accuracy }, manual ? "button" : "auto");
    };
    const fail = (err: GeolocationPositionError) => setMyLoc({ kind: err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable" });
    // Fresh GPS fix first (10s, no cache: a re-tap after walking must not show the old spot); fallback network location (10s, ≤1 min cache).
    navigator.geolocation.getCurrentPosition(ok, (err) => {
      if (err.code === err.PERMISSION_DENIED) { fail(err); return; }
      navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  };
  // Dasom 2026-10-16: ask for location automatically on the market map so the blue dot is always there.
  useEffect(() => { if (!detail) locate(false); }, [detail]); // eslint-disable-line react-hooks/exhaustive-deps
  // Overview pick: bring the picked store (red) into view.
  useEffect(() => {
    if (detail || !selectedId) return;
    const el = [...(rootRef.current?.querySelectorAll<SVGGraphicsElement>(`a[data-store-id="${selectedId}"]`) ?? [])].find((g) => g.getBoundingClientRect().width > 0);
    if (!el) return;
    const me = [...document.querySelectorAll<SVGGElement>(".wcm-floor-me")].find((g) => g.getBoundingClientRect().width > 0);
    if (me && typeof window.scrollBy === "function") {
      const a = me.getBoundingClientRect(), b = el.getBoundingClientRect();
      const top = Math.min(a.top, b.top), bottom = Math.max(a.bottom, b.bottom);
      // Both fit (leaving room for header/button): centre them together. Otherwise the store wins
      // and the edge arrow points to my location.
      if (bottom - top <= window.innerHeight - 160) {
        window.scrollBy({ top: (top + bottom) / 2 - window.innerHeight / 2, behavior: "smooth" });
        return;
      }
    }
    el.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [detail, selectedId]);
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
    if (fixV?.kind !== "ok" || !manualLocateRef.current) return;
    const el = [...document.querySelectorAll<SVGGElement>(".wcm-floor-me")].find((g) => g.getBoundingClientRect().width > 0);
    if (!el) return;
    // With a picked store, frame both: centre the midpoint of the dot and the store.
    const sel = selectedId && !detail ? [...(rootRef.current?.querySelectorAll<SVGGraphicsElement>(`a[data-store-id="${selectedId}"]`) ?? [])].find((g) => g.getBoundingClientRect().width > 0) : undefined;
    if (sel && typeof window.scrollBy === "function") {
      const a = el.getBoundingClientRect(), b = sel.getBoundingClientRect();
      const mid = (Math.min(a.top, b.top) + Math.max(a.bottom, b.bottom)) / 2;
      window.scrollBy({ top: mid - window.innerHeight / 2, behavior: "smooth" });
      return;
    }
    el.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [myLoc]); // eslint-disable-line react-hooks/exhaustive-deps
  // Edge arrow toward my location when the dot is off screen.
  const [meEdge, setMeEdge] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (detail || fixV?.kind !== "ok") { setMeEdge(null); return; }
    const update = () => {
      const me = [...document.querySelectorAll<SVGGElement>(".wcm-floor-me")].find((g) => g.getBoundingClientRect().width > 0);
      if (!me) { setMeEdge(null); return; }
      const r = me.getBoundingClientRect();
      setMeEdge(r.bottom < 60 ? "up" : r.top > window.innerHeight - 20 ? "down" : null);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [detail, fixV?.kind, myLoc]); // eslint-disable-line react-hooks/exhaustive-deps
  const goToMe = () => [...document.querySelectorAll<SVGGElement>(".wcm-floor-me")].find((g) => g.getBoundingClientRect().width > 0)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  const byId = new Map(stores.map((s) => [s.id, s]));
  const ko = locale === "ko";
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
        return <a key={s.storeId} href={qrDestinationPath(s.storeId)} data-store-id={s.storeId} className={[selected ? "is-selected" : "", highlightIds ? (highlightIds.has(s.storeId) ? "is-hl" : "is-dim") : ""].filter(Boolean).join(" ") || undefined}
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
    <div ref={rootRef} className={`wcm-floor${detail ? " is-detail" : ""}`} data-map-provider="floor">
      {detail ? null : <>
      {/* Floating "my location" button + toast, shown while the map is on screen. */}
      {askConsent ? <div className="wcm-geo-consent" role="dialog" aria-modal="false" aria-label={ct.label}>
        <p>{ct.before}<a href={PRIVACY_POLICY_PATH} target="_blank" rel="noopener noreferrer">{ct.link}</a>{ct.after}</p>
        <div><button type="button" onClick={() => answerConsent(false)}>{ct.no}</button><button type="button" className="is-yes" onClick={() => answerConsent(true)}>{ct.yes}</button></div>
      </div> : null}
      {meEdge && mapOnScreen ? <button type="button" className={`wcm-floor-me-edge is-${meEdge}`} onClick={goToMe}>{meEdge === "up" ? "↑" : "↓"} {mt.button}</button> : null}
      <div className={`wcm-floor-myloc${mapOnScreen ? "" : " is-offscreen"}`}>
        {myMsg ? <span role="status" className={`wcm-floor-toast${fixV?.kind === "ok" ? " is-ok" : ""}`}>{myMsg}</span> : null}
        <button type="button" onClick={() => locate()} disabled={myLoc.kind === "locating"}><span aria-hidden="true">◎</span> {mt.button}</button>
      </div>
      </>}
      <div className="wcm-floor-plan is-vertical">{renderPlan(vertical, false)}</div>
      <div className="wcm-floor-plan is-horizontal">{renderPlan(horizontal, false)}</div>
      <p className="wcm-floor-note">{ko ? "개략도입니다. 점포 위치와 순서는 주소 기반 추정이며 실측이 아닙니다. 입구·화장실 정보는 아직 없습니다." : ui.mapGuideApproximate}
        {" · "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></p>
    </div>
  );
}
