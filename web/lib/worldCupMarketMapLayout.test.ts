import { describe, expect, it } from "vitest";
import {
  buildWorldCupMarketMapPlacements,
  getWorldCupMarketMapPlacement,
  layoutWorldCupMarketMapPins,
  WORLD_CUP_MARKET_MAP_PLACEMENTS,
  WORLD_CUP_MARKET_PIN_SPACING,
  type WorldCupMarketMapPin,
} from "./worldCupMarketMapLayout";
import { isWorldCupMarketCoordinate, WORLD_CUP_MARKET_STORES } from "./worldCupMarketStores";
import type { Coordinate } from "./types";

function distanceMeters(from: Coordinate, to: Coordinate): number {
  const north = (to.latitude - from.latitude) * 111_320;
  const east = (to.longitude - from.longitude) * 111_320 * Math.cos(from.latitude * Math.PI / 180);
  return Math.hypot(north, east);
}

describe("world cup market display placement", () => {
  it("keeps all 45 locations separate and explicitly marks the 39 offsets across 12 shared buildings", () => {
    expect(WORLD_CUP_MARKET_MAP_PLACEMENTS).toHaveLength(45);
    const positions = new Set(WORLD_CUP_MARKET_MAP_PLACEMENTS.map(({ displayLocation }) =>
      `${displayLocation.latitude},${displayLocation.longitude}`));
    expect(positions.size).toBe(45);
    const approximate = WORLD_CUP_MARKET_MAP_PLACEMENTS.filter((placement) => placement.approximate);
    expect(approximate).toHaveLength(39);
    const buildings = new Set(approximate.map(({ storeId }) => {
      const location = WORLD_CUP_MARKET_STORES.find((store) => store.id === storeId)!.storeLocation!;
      return `${location.latitude},${location.longitude}`;
    }));
    expect(buildings.size).toBe(12);
  });

  it("bounds approximate points to 10–20 metres, preserving each original address and navigation evidence", () => {
    const before = JSON.stringify(WORLD_CUP_MARKET_STORES);
    const placements = buildWorldCupMarketMapPlacements(WORLD_CUP_MARKET_STORES);
    expect(JSON.stringify(WORLD_CUP_MARKET_STORES)).toBe(before);
    for (const placement of placements) {
      const store = WORLD_CUP_MARKET_STORES.find((item) => item.id === placement.storeId)!;
      const location = store.storeLocation!;
      expect(isWorldCupMarketCoordinate(placement.displayLocation)).toBe(true);
      expect(placement.sourceUrl).toBe(location.sourceUrl);
      expect(store.navigationTarget).toEqual(location);
      if (placement.approximate) {
        expect(distanceMeters(location, placement.displayLocation)).toBeGreaterThanOrEqual(9.99);
        expect(distanceMeters(location, placement.displayLocation)).toBeLessThanOrEqual(20.01);
        expect(placement.method).toBe("DETERMINISTIC_OFFSET");
      } else {
        expect(placement.displayLocation).toEqual({ latitude: location.latitude, longitude: location.longitude });
        expect(placement.method).toBe("BUILDING_COORDINATE");
      }
    }
  });

  it("is independent of input order and keeps each filtered store on its full-dataset position", () => {
    expect(buildWorldCupMarketMapPlacements([...WORLD_CUP_MARKET_STORES].reverse()))
      .toEqual(WORLD_CUP_MARKET_MAP_PLACEMENTS);
    for (const category of new Set(WORLD_CUP_MARKET_STORES.map((store) => store.category))) {
      for (const store of WORLD_CUP_MARKET_STORES.filter((item) => item.category === category)) {
        expect(getWorldCupMarketMapPlacement(store.id))
          .toEqual(WORLD_CUP_MARKET_MAP_PLACEMENTS.find((placement) => placement.storeId === store.id));
      }
    }
    expect(getWorldCupMarketMapPlacement("not-a-store")).toBeNull();
  });

  it("does not invent points for missing or invalid building coordinates", () => {
    const store = WORLD_CUP_MARKET_STORES[0]!;
    expect(buildWorldCupMarketMapPlacements([
      { ...store, storeLocation: null },
      { ...store, id: "invalid", storeLocation: { ...store.storeLocation!, latitude: Number.NaN } },
    ])).toEqual([]);
  });
});

function expectReadablePins(pins: readonly WorldCupMarketMapPin[], width: number, height: number): void {
  const radius = 11;
  for (const [index, pin] of pins.entries()) {
    expect(pin.x - radius).toBeGreaterThanOrEqual(0);
    expect(pin.y - radius).toBeGreaterThanOrEqual(0);
    expect(pin.x + radius).toBeLessThanOrEqual(width);
    expect(pin.y + radius).toBeLessThanOrEqual(height);
    for (const other of pins.slice(index + 1)) {
      expect(Math.hypot(pin.x - other.x, pin.y - other.y)).toBeGreaterThanOrEqual(WORLD_CUP_MARKET_PIN_SPACING);
    }
  }
  expect(WORLD_CUP_MARKET_PIN_SPACING).toBeGreaterThanOrEqual(22 + 4);
}

describe("world cup market screen-space pin layout", () => {
  it.each([[320, 480], [390, 640], [960, 520]])("separates all 45 coincident pins within a %i x %i viewport", (width, height) => {
    const points = WORLD_CUP_MARKET_STORES.map((store) => ({ storeId: store.id, x: width / 2, y: height / 2 }));
    const before = JSON.stringify(points);
    const pins = layoutWorldCupMarketMapPins(points, width, height);
    expect(pins).toHaveLength(45);
    expect(new Set(pins.map((pin) => pin.storeId)).size).toBe(45);
    expectReadablePins(pins, width, height);
    for (const pin of pins) expect([pin.anchorX, pin.anchorY]).toEqual([width / 2, height / 2]);
    expect(layoutWorldCupMarketMapPins([...points].reverse(), width, height)).toEqual(pins);
    expect(layoutWorldCupMarketMapPins(points, width, height)).toEqual(pins);
    expect(JSON.stringify(points)).toBe(before);
  });

  it("keeps a dense projected market corridor readable while preserving every geographic anchor", () => {
    const width = 390;
    const height = 640;
    const points = WORLD_CUP_MARKET_MAP_PLACEMENTS.map(({ storeId, displayLocation }) => ({
      storeId,
      x: 190 + (displayLocation.longitude - 126.9054) * 70_000,
      y: 310 - (displayLocation.latitude - 37.5580) * 100_000,
    }));
    const pins = layoutWorldCupMarketMapPins(points, width, height);
    expect(pins).toHaveLength(45);
    expectReadablePins(pins, width, height);
    for (const pin of pins) {
      const point = points.find((candidate) => candidate.storeId === pin.storeId)!;
      expect([pin.anchorX, pin.anchorY]).toEqual([point.x, point.y]);
    }
  });

  it("keeps edge pins inside the viewport and omits invalid or offscreen anchors", () => {
    const pins = layoutWorldCupMarketMapPins([
      { storeId: "top-left", x: 0, y: 0 },
      { storeId: "bottom-right", x: 320, y: 480 },
      { storeId: "negative-x", x: -1, y: 240 },
      { storeId: "negative-y", x: 160, y: -1 },
      { storeId: "past-right", x: 321, y: 240 },
      { storeId: "past-bottom", x: 160, y: 481 },
      { storeId: "nan", x: Number.NaN, y: 240 },
      { storeId: "infinite", x: 160, y: Number.POSITIVE_INFINITY },
    ], 320, 480);
    expect(pins.map((pin) => pin.storeId).sort()).toEqual(["bottom-right", "top-left"]);
    expectReadablePins(pins, 320, 480);
    expect(layoutWorldCupMarketMapPins([], 320, 480)).toEqual([]);
    expect(layoutWorldCupMarketMapPins([{ storeId: "hidden", x: 0, y: 0 }], 0, 0)).toEqual([]);
  });
});
