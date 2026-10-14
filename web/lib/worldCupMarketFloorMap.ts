import { WORLD_CUP_MARKET_MAP_PLACEMENTS } from "./worldCupMarketMapLayout";
import { WORLD_CUP_MARKET_OSM_STREETS } from "./worldCupMarketOsmStreets";
import type { WorldCupMarketCategoryGroup, WorldCupMarketStore } from "./worldCupMarketStores";

/**
 * Schematic "department-store directory" plan of 월드컵시장 (v2).
 * The market alley (망원로7길) is drawn straight; side streets cut it where the
 * OSM centrelines cross it. Stalls tile both sides of the alley. Side and order
 * come only from the existing approximate display points
 * (worldCupMarketMapLayout.ts): side = which side of the OSM alley the point is
 * on, order = position along the alley. Neither is surveyed stall order.
 */
export const FLOOR_MAP_REFERENCE = { latitude: 37.5583, longitude: 126.905438 } as const;
const METERS_PER_LAT = 111_320;
const LON_SCALE = METERS_PER_LAT * Math.cos(FLOOR_MAP_REFERENCE.latitude * Math.PI / 180);
const AXIS_ANGLE = Math.atan2(0.38, 1); // NNW corridor → screen vertical
export const MARKET_STREET = "망원로7길";

export const FLOOR_PLAN = { width: 360, margin: 12, alley: 58, stallDepth: 133, stallHeight: 46, street: 30, top: 14, bottom: 14 } as const;

/** Pastel fills (block) and stronger tones (badge/chip) per category group. */
export const FLOOR_MAP_COLORS: Readonly<Record<WorldCupMarketCategoryGroup | "unknown", { fill: string; strong: string }>> = {
  produce: { fill: "#b9e08f", strong: "#5aa832" },
  seafood: { fill: "#8fd8d2", strong: "#14a39a" },
  meat: { fill: "#f7a9c4", strong: "#e0457f" },
  snacks: { fill: "#fdc98a", strong: "#f0841c" },
  restaurant: { fill: "#f4b2a6", strong: "#e2563f" },
  pantry: { fill: "#e5cfa4", strong: "#b0843a" },
  living: { fill: "#c3b2ef", strong: "#7a5bd6" },
  unknown: { fill: "#d5dade", strong: "#78909c" },
};

/** Direction only (OSM/Nominatim points near each station, 2026-10-14). */
export const FLOOR_MAP_STATIONS = [
  { id: "mangwon", nameKo: "망원역 6호선", nameEn: "Mangwon Stn (6)", latitude: 37.5556, longitude: 126.9105 },
  { id: "mapo-gu-office", nameKo: "마포구청역 6호선", nameEn: "Mapo-gu Office Stn (6)", latitude: 37.5609, longitude: 126.9055 },
] as const;

export function rotateMeters(east: number, north: number): { x: number; y: number } {
  const c = Math.cos(AXIS_ANGLE), s = Math.sin(AXIS_ANGLE);
  return { x: east * c + north * s, y: east * s - north * c };
}
const toPlan = (lat: number, lon: number) =>
  rotateMeters((lon - FLOOR_MAP_REFERENCE.longitude) * LON_SCALE, (lat - FLOOR_MAP_REFERENCE.latitude) * METERS_PER_LAT);
/** Screen angle (deg, 0 = right, 90 = down) of a geographic bearing vector in plan space. */
const planAngle = (east: number, north: number) => { const r = rotateMeters(east, north); return Math.atan2(r.y, r.x) * 180 / Math.PI; };

export interface FloorStall {
  readonly storeId: string; readonly number: number | null; readonly group: WorldCupMarketCategoryGroup | "unknown";
  readonly side: -1 | 1; readonly x: number; readonly y: number; readonly width: number; readonly height: number;
}
export interface FloorStreetCut { readonly y: number; readonly name: string | null; readonly left: boolean; readonly right: boolean }
export interface FloorBuilding { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface FloorPlanLayout {
  readonly width: number; readonly height: number;
  readonly alley: { readonly x: number; readonly width: number };
  readonly stalls: readonly FloorStall[];
  readonly buildings: readonly FloorBuilding[];
  readonly cuts: readonly FloorStreetCut[];
  readonly northAngle: number;
  readonly stations: readonly { id: string; nameKo: string; nameEn: string; angle: number }[];
}

type P = { x: number; y: number };
function alleyPolyline(): P[] {
  return WORLD_CUP_MARKET_OSM_STREETS.filter((s) => s.name === MARKET_STREET && s.kind === "residential")
    .flatMap((s) => s.points.map(([e, n]) => rotateMeters(e, n))).sort((a, b) => a.y - b.y);
}
function alleyXAt(alley: readonly P[], y: number): number {
  for (let i = 1; i < alley.length; i++) {
    const a = alley[i - 1]!, b = alley[i]!;
    if (y >= a.y && y <= b.y && a.y !== b.y) return a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
  }
  return (y < alley[0]!.y ? alley[0]! : alley[alley.length - 1]!).x;
}

/** Plan-space y of side streets meeting the alley, with the sides they leave on. */
function crossings(alley: readonly P[], minY: number, maxY: number): { y: number; name: string | null; left: boolean; right: boolean }[] {
  const out: { y: number; name: string | null; left: boolean; right: boolean }[] = [];
  for (const street of WORLD_CUP_MARKET_OSM_STREETS) {
    if (street.name === MARKET_STREET) continue;
    const pts = street.points.map(([e, n]) => rotateMeters(e, n));
    let best: { d: number; y: number } | null = null;
    for (const p of pts) { const d = Math.abs(p.x - alleyXAt(alley, p.y)); if (!best || d < best.d) best = { d, y: p.y }; }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!, b = pts[i]!; const da = a.x - alleyXAt(alley, a.y), db = b.x - alleyXAt(alley, b.y);
      if (da * db <= 0 && da !== db) { const t = da / (da - db); const y = a.y + (b.y - a.y) * t; best = { d: 0, y }; }
    }
    if (!best || best.d > 6 || best.y < minY - 8 || best.y > maxY + 8) continue;
    const near = pts.filter((p) => Math.abs(p.y - best!.y) < 60);
    const left = near.some((p) => p.x < alleyXAt(alley, p.y) - 8), right = near.some((p) => p.x > alleyXAt(alley, p.y) + 8);
    if (!out.some((c) => Math.abs(c.y - best!.y) < 6)) out.push({ y: best.y, name: street.name, left, right });
  }
  return out.sort((a, b) => a.y - b.y);
}

export function buildFloorMapLayout(stores: readonly WorldCupMarketStore[]): FloorPlanLayout {
  const alley = alleyPolyline();
  // Ordering uses all 45 points so filtering never moves a stall.
  const points = WORLD_CUP_MARKET_MAP_PLACEMENTS.map((p) => {
    const r = toPlan(p.displayLocation.latitude, p.displayLocation.longitude);
    return { storeId: p.storeId, y: r.y, side: (r.x < alleyXAt(alley, r.y) ? -1 : 1) as -1 | 1 };
  });
  const ys = points.map((p) => p.y);
  const cutsGeo = crossings(alley, Math.min(...ys), Math.max(...ys));
  const segmentOf = (y: number) => cutsGeo.filter((c) => c.y < y).length;
  const segCount = cutsGeo.length + 1;
  const bySeg: { left: typeof points; right: typeof points }[] = Array.from({ length: segCount }, () => ({ left: [], right: [] }));
  for (const p of points) (p.side < 0 ? bySeg[segmentOf(p.y)]!.left : bySeg[segmentOf(p.y)]!.right).push(p);

  const F = FLOOR_PLAN;
  const alleyX = (F.width - F.alley) / 2;
  const sideX = { "-1": alleyX - F.stallDepth, "1": alleyX + F.alley } as const;
  const byId = new Map(stores.map((s) => [s.id, s]));
  const stalls: FloorStall[] = [], buildings: FloorBuilding[] = [], cuts: FloorStreetCut[] = [];
  let y = F.top;
  bySeg.forEach((seg, i) => {
    const rows = Math.max(seg.left.length, seg.right.length, 1);
    const h = rows * F.stallHeight;
    for (const side of [-1, 1] as const) {
      const list = (side < 0 ? seg.left : seg.right).sort((a, b) => a.y - b.y || a.storeId.localeCompare(b.storeId));
      buildings.push({ x: sideX[side], y, width: F.stallDepth, height: h });
      const each = list.length ? h / list.length : 0;
      list.forEach((p, k) => {
        const store = byId.get(p.storeId); if (!store) return;
        stalls.push({ storeId: p.storeId, number: store.corridorOrder, group: store.categoryGroup ?? "unknown", side, x: sideX[side], y: y + k * each, width: F.stallDepth, height: each });
      });
    }
    y += h;
    const cut = cutsGeo[i];
    if (cut) { cuts.push({ y: y + F.street / 2, name: cut.name, left: cut.left, right: cut.right }); y += F.street; }
  });
  const height = Math.round(y + F.bottom);
  return {
    width: F.width, height, alley: { x: alleyX, width: F.alley }, stalls, buildings, cuts,
    northAngle: planAngle(0, 1),
    stations: FLOOR_MAP_STATIONS.map((s) => { const r = toPlan(s.latitude, s.longitude); return { id: s.id, nameKo: s.nameKo, nameEn: s.nameEn, angle: Math.atan2(r.y, r.x) * 180 / Math.PI }; }),
  };
}

export interface StallLabel { readonly fontSize: number; readonly lines: readonly string[] }
const charW = (ch: string) => (/[\u3131-\uD79D\u4E00-\u9FFF\u3040-\u30FF]/.test(ch) ? 1 : ch === " " ? 0.3 : 0.58);
export const textWidth = (text: string, size: number) => [...text].reduce((w, ch) => w + charW(ch), 0) * size;

/** Shrink 12→8px, then wrap to 2 lines; null means show the number only. */
export function fitStallLabel(name: string, boxWidth: number, boxHeight: number): StallLabel | null {
  for (let size = 12; size >= 8; size -= 0.5) {
    if (textWidth(name, size) <= boxWidth && size * 1.2 <= boxHeight) return { fontSize: size, lines: [name] };
  }
  const chars = [...name];
  const splits: [string, string][] = [];
  const spaces = chars.map((c, i) => (c === " " ? i : -1)).filter((i) => i > 0);
  for (const i of spaces) splits.push([chars.slice(0, i).join(""), chars.slice(i + 1).join("")]);
  const mid = Math.ceil(chars.length / 2);
  splits.push([chars.slice(0, mid).join(""), chars.slice(mid).join("")]);
  for (let size = 11; size >= 8; size -= 0.5) {
    if (size * 2.3 > boxHeight) continue;
    const ok = splits.filter(([a, b]) => textWidth(a, size) <= boxWidth && textWidth(b, size) <= boxWidth)
      .sort((p, q) => Math.max(textWidth(p[0], 1), textWidth(p[1], 1)) - Math.max(textWidth(q[0], 1), textWidth(q[1], 1)));
    if (ok[0]) return { fontSize: size, lines: ok[0] };
  }
  return null;
}
