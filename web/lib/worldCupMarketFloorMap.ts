import { WORLD_CUP_MARKET_MAP_PLACEMENTS } from "./worldCupMarketMapLayout";
import { WORLD_CUP_MARKET_OSM_STREETS } from "./worldCupMarketOsmStreets";
import type { WorldCupMarketCategoryGroup, WorldCupMarketStore } from "./worldCupMarketStores";

/**
 * Flat "mall directory" plan of 월드컵시장. Geometry comes only from:
 *  - OSM street centrelines (worldCupMarketOsmStreets.ts), and
 *  - the existing approximate display points (worldCupMarketMapLayout.ts).
 * Blocks snap to a tap-friendly grid near their display point; a leader line
 * shows the shift. Nothing here is a surveyed stall position.
 */
export const FLOOR_MAP_REFERENCE = { latitude: 37.5583, longitude: 126.905438 } as const;
const METERS_PER_LAT = 111_320;
const LON_SCALE = METERS_PER_LAT * Math.cos(FLOOR_MAP_REFERENCE.latitude * Math.PI / 180);
// Rotate the NNW corridor (north 1, east -0.38) to screen-vertical.
const AXIS_ANGLE = Math.atan2(0.38, 1);

export const FLOOR_MAP_WIDTH = 360;
export const FLOOR_MAP_BLOCK = { width: 40, height: 30, gap: 4 } as const;
export const MARKET_STREET = "망원로7길";
export const FLOOR_MAP_ALLEY_WIDTH = 18;
const PAD_METERS = { across: 26, along: 22 };

export const FLOOR_MAP_COLORS: Readonly<Record<WorldCupMarketCategoryGroup | "unknown", string>> = {
  produce: "#43a047", seafood: "#1e88e5", meat: "#e53935", snacks: "#fb8c00",
  restaurant: "#d81b60", pantry: "#8d6e63", living: "#7e57c2", unknown: "#90a4ae",
};

/** Directions only (OSM/Nominatim station area points, 2026-10-14); not a walking route. */
export const FLOOR_MAP_STATIONS = [
  { id: "mangwon", nameKo: "망원역 (6호선)", nameEn: "Mangwon Stn (Line 6)", latitude: 37.5556, longitude: 126.9105 },
  { id: "mapo-gu-office", nameKo: "마포구청역 (6호선)", nameEn: "Mapo-gu Office Stn (Line 6)", latitude: 37.5609, longitude: 126.9055 },
] as const;

export function rotateMeters(east: number, north: number): { x: number; y: number } {
  const c = Math.cos(AXIS_ANGLE), s = Math.sin(AXIS_ANGLE);
  // screen x grows to the right, y grows downward
  return { x: east * c + north * s, y: -(-east * s + north * c) };
}

function toMeters(lat: number, lon: number) {
  return { east: (lon - FLOOR_MAP_REFERENCE.longitude) * LON_SCALE, north: (lat - FLOOR_MAP_REFERENCE.latitude) * METERS_PER_LAT };
}

export interface FloorMapBlock {
  readonly storeId: string;
  readonly number: number | null;
  readonly group: WorldCupMarketCategoryGroup | "unknown";
  readonly x: number; readonly y: number;
  readonly anchorX: number; readonly anchorY: number;
}
export interface FloorMapLayout {
  readonly width: number; readonly height: number;
  readonly blocks: readonly FloorMapBlock[];
  readonly streets: readonly { id: number; kind: string; name: string | null; d: string; labelAt: { x: number; y: number; angle: number } | null }[];
  readonly stations: readonly { id: string; nameKo: string; nameEn: string; x: number; y: number; angle: number }[];
}

export function buildFloorMapLayout(stores: readonly WorldCupMarketStore[]): FloorMapLayout {
  const byId = new Map(stores.map((store) => [store.id, store]));
  const anchors = WORLD_CUP_MARKET_MAP_PLACEMENTS.filter((p) => byId.has(p.storeId)).map((p) => {
    const m = toMeters(p.displayLocation.latitude, p.displayLocation.longitude);
    return { storeId: p.storeId, ...rotateMeters(m.east, m.north) };
  });
  // Bounds from all 45 placements so filtering never rescales the plan.
  const all = WORLD_CUP_MARKET_MAP_PLACEMENTS.map((p) => {
    const m = toMeters(p.displayLocation.latitude, p.displayLocation.longitude);
    return rotateMeters(m.east, m.north);
  });
  const minX = Math.min(...all.map((p) => p.x)) - PAD_METERS.across, maxX = Math.max(...all.map((p) => p.x)) + PAD_METERS.across;
  const minY = Math.min(...all.map((p) => p.y)) - PAD_METERS.along, maxY = Math.max(...all.map((p) => p.y)) + PAD_METERS.along;
  const scale = FLOOR_MAP_WIDTH / (maxX - minX);
  const height = Math.round((maxY - minY) * scale);
  const sx = (x: number) => (x - minX) * scale, sy = (y: number) => (y - minY) * scale;

  const { width: bw, height: bh, gap } = FLOOR_MAP_BLOCK;
  // Market alley (망원로7길) centreline in screen space; blocks line up on both sides of it.
  const alley = WORLD_CUP_MARKET_OSM_STREETS.filter((st) => st.name === MARKET_STREET && st.kind === "residential")
    .flatMap((st) => st.points.map(([e, n]) => { const r = rotateMeters(e, n); return { x: sx(r.x), y: sy(r.y) }; }));
  const alleyX = (y: number): number => {
    let best = alley[0]?.x ?? FLOOR_MAP_WIDTH / 2, bestD = Infinity;
    for (let i = 1; i < alley.length; i++) {
      const a = alley[i - 1]!, b = alley[i]!;
      if ((y - a.y) * (y - b.y) <= 0 && a.y !== b.y) return a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
    }
    for (const p of alley) { const d = Math.abs(p.y - y); if (d < bestD) { bestD = d; best = p.x; } }
    return best;
  };
  const half = FLOOR_MAP_ALLEY_WIDTH / 2;
  const cells: { x: number; y: number; side: -1 | 1 }[] = [];
  for (let y = bh / 2 + 22; y <= height - bh / 2 - 22; y += bh + gap) {
    const cx = alleyX(y);
    for (const side of [-1, 1] as const)
      for (let col = 0; col < 2; col++) {
        const x = cx + side * (half + gap + bw / 2 + col * (bw + gap));
        if (x - bw / 2 >= 2 && x + bw / 2 <= FLOOR_MAP_WIDTH - 2) cells.push({ x, y, side });
      }
  }
  const blocks: FloorMapBlock[] = [];
  for (const a of [...anchors].sort((l, r) => l.storeId.localeCompare(r.storeId))) {
    const ax = sx(a.x), ay = sy(a.y);
    const side = ax < alleyX(ay) ? -1 : 1;
    let best = -1, dist = Infinity;
    cells.forEach((c, i) => { const d = (c.x - ax) ** 2 + (c.y - ay) ** 2 + (c.side === side ? 0 : 1e6); if (d < dist) { dist = d; best = i; } });
    if (best < 0) continue;
    const [cell] = cells.splice(best, 1);
    const store = byId.get(a.storeId)!;
    blocks.push({ storeId: a.storeId, number: store.corridorOrder, group: store.categoryGroup ?? "unknown", x: cell!.x, y: cell!.y, anchorX: ax, anchorY: ay });
  }

  const streets = WORLD_CUP_MARKET_OSM_STREETS.map((street) => {
    const pts = street.points.map(([e, n]) => { const r = rotateMeters(e, n); return { x: sx(r.x), y: sy(r.y) }; });
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const inside = pts.filter((p) => p.x > 20 && p.x < FLOOR_MAP_WIDTH - 20 && p.y > 20 && p.y < height - 20);
    let labelAt = null;
    if (inside.length >= 2) {
      const a = inside[0]!, b = inside[inside.length - 1]!;
      let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      if (angle > 90) angle -= 180; if (angle < -90) angle += 180;
      labelAt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle };
    }
    return { id: street.id, kind: street.kind, name: street.name, d, labelAt };
  });

  const cx = FLOOR_MAP_WIDTH / 2, cy = height / 2;
  const stations = FLOOR_MAP_STATIONS.map((st) => {
    const m = toMeters(st.latitude, st.longitude); const r = rotateMeters(m.east, m.north);
    const dx = sx(r.x) - cx, dy = sy(r.y) - cy;
    const k = Math.min((cx - 30) / Math.abs(dx || 1e-9), (cy - 24) / Math.abs(dy || 1e-9));
    return { id: st.id, nameKo: st.nameKo, nameEn: st.nameEn, x: Math.min(FLOOR_MAP_WIDTH - 52, Math.max(52, cx + dx * k)), y: cy + dy * k, angle: Math.atan2(dy, dx) * 180 / Math.PI };
  });
  return { width: FLOOR_MAP_WIDTH, height, blocks, streets, stations };
}
