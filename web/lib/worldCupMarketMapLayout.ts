import type { Coordinate } from "./types";
import {
  isWorldCupMarketCoordinate,
  WORLD_CUP_MARKET_STORES,
  type WorldCupMarketStore,
} from "./worldCupMarketStores";

export interface WorldCupMarketMapPlacement {
  readonly storeId: string;
  /** Rendering only: never use this position as a navigation or street-view target. */
  readonly displayLocation: Coordinate;
  readonly approximate: boolean;
  readonly method: "BUILDING_COORDINATE" | "DETERMINISTIC_OFFSET";
  /** Blog evidence for the original building address, not evidence for an offset. */
  readonly sourceUrl: string | null;
}

const METERS_PER_LATITUDE_DEGREE = 111_320;

// The address geocodes describe a north-northwest/south-southeast market corridor.
// This axis is a display-layout estimate, not a surveyed alley or storefront map.
const CORRIDOR_REFERENCE: Coordinate = { latitude: 37.5583, longitude: 126.905438 };
const CORRIDOR_NORTH = 1 / Math.hypot(1, 0.38);
const CORRIDOR_EAST = -0.38 * CORRIDOR_NORTH;

function offsetTowardCorridor(origin: Coordinate, alongMeters: number, acrossMeters: number): Coordinate {
  const longitudeScale = METERS_PER_LATITUDE_DEGREE * Math.cos(origin.latitude * Math.PI / 180);
  const eastFromAxis = (origin.longitude - CORRIDOR_REFERENCE.longitude) * longitudeScale;
  const northFromAxis = (origin.latitude - CORRIDOR_REFERENCE.latitude) * METERS_PER_LATITUDE_DEGREE;
  const side = eastFromAxis * CORRIDOR_NORTH - northFromAxis * CORRIDOR_EAST;
  const towardAxis = side > 0 ? -1 : 1;
  const northMeters = alongMeters * CORRIDOR_NORTH - acrossMeters * towardAxis * CORRIDOR_EAST;
  const eastMeters = alongMeters * CORRIDOR_EAST + acrossMeters * towardAxis * CORRIDOR_NORTH;
  return {
    latitude: origin.latitude + northMeters / METERS_PER_LATITUDE_DEGREE,
    longitude: origin.longitude + eastMeters / longitudeScale,
  };
}

/**
 * Build from the complete dataset before applying category filters. The fixed ID
 * order keeps placement identical after filtering, re-rendering or language changes.
 *
 * No floor plan matching the blog's store numbers was verified (2026-10-08).
 * Official source checked: https://m.blog.naver.com/mwwdc
 * Blog post numbers are not treated as surveyed frontage/corridor order. The 39
 * stores sharing 12 building positions receive explicit approximate display points
 * 10–20 m from their building, laid out in a narrow strip toward the market axis.
 * Six individual building positions remain unchanged. Original location evidence,
 * navigation targets and street-view locations are never mutated.
 *
 * Screen-space marker collision handling is separate: geographic separation alone
 * cannot guarantee readable pins at every zoom level.
 */
export function buildWorldCupMarketMapPlacements(
  stores: readonly WorldCupMarketStore[],
): readonly WorldCupMarketMapPlacement[] {
  const groups = new Map<string, WorldCupMarketStore[]>();
  for (const store of stores) {
    const location = store.storeLocation;
    if (!location || !isWorldCupMarketCoordinate(location)) continue;
    const key = `${location.latitude},${location.longitude}`;
    const group = groups.get(key) ?? [];
    group.push(store);
    groups.set(key, group);
  }

  const placements: WorldCupMarketMapPlacement[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => left.id.localeCompare(right.id));
    const columns = Math.ceil(Math.sqrt(ordered.length));
    const rows = Math.ceil(ordered.length / columns);
    for (const [index, store] of ordered.entries()) {
      const location = store.storeLocation!;
      const approximate = ordered.length > 1;
      const column = Math.floor(index / rows);
      const row = index % rows;
      const alongMeters = columns > 1 ? (column / (columns - 1) - 0.5) * 24 : 0;
      const acrossMeters = rows > 1 ? 10 + row / (rows - 1) * 6 : 13;
      placements.push({
        storeId: store.id,
        displayLocation: approximate
          ? offsetTowardCorridor(location, alongMeters, acrossMeters)
          : { latitude: location.latitude, longitude: location.longitude },
        approximate,
        method: approximate ? "DETERMINISTIC_OFFSET" : "BUILDING_COORDINATE",
        sourceUrl: location.sourceUrl,
      });
    }
  }
  return placements.sort((left, right) => left.storeId.localeCompare(right.storeId));
}

export const WORLD_CUP_MARKET_MAP_PLACEMENTS = buildWorldCupMarketMapPlacements(WORLD_CUP_MARKET_STORES);

export function getWorldCupMarketMapPlacement(storeId: string): WorldCupMarketMapPlacement | null {
  return WORLD_CUP_MARKET_MAP_PLACEMENTS.find((placement) => placement.storeId === storeId) ?? null;
}

export interface WorldCupMarketMapPoint {
  readonly storeId: string;
  readonly x: number;
  readonly y: number;
}

export interface WorldCupMarketMapPin extends WorldCupMarketMapPoint {
  /** Projected geographic point; the button can move in pixels to avoid overlap. */
  readonly anchorX: number;
  readonly anchorY: number;
}

export const WORLD_CUP_MARKET_PIN_SPACING = 26;

/**
 * Give every visible store its own 22px button, with a 4px gap. A short leader
 * connects a displaced button to its geographic display point. These pixel
 * offsets never change displayLocation or the original building coordinates.
 */
export function layoutWorldCupMarketMapPins(
  points: readonly WorldCupMarketMapPoint[],
  width: number,
  height: number,
): readonly WorldCupMarketMapPin[] {
  const margin = 15;
  const spacing = WORLD_CUP_MARKET_PIN_SPACING;
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = margin; y <= height - margin; y += spacing) {
    for (let x = margin; x <= width - margin; x += spacing) cells.push({ x, y });
  }
  const pins: WorldCupMarketMapPin[] = [];
  for (const point of [...points].sort((left, right) => left.storeId.localeCompare(right.storeId))) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
      || point.x < 0 || point.y < 0 || point.x > width || point.y > height) continue;
    let nearest = -1;
    let distance = Number.POSITIVE_INFINITY;
    for (const [index, cell] of cells.entries()) {
      const candidate = (cell.x - point.x) ** 2 + (cell.y - point.y) ** 2;
      if (candidate < distance) {
        nearest = index;
        distance = candidate;
      }
    }
    if (nearest < 0) continue;
    const [cell] = cells.splice(nearest, 1);
    pins.push({ storeId: point.storeId, x: cell!.x, y: cell!.y, anchorX: point.x, anchorY: point.y });
  }
  return pins;
}
