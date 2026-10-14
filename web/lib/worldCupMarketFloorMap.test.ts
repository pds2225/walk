import { describe, expect, it } from "vitest";
import { buildFloorMapLayout, FLOOR_MAP_BLOCK } from "./worldCupMarketFloorMap";
import { WORLD_CUP_MARKET_MAP_PLACEMENTS } from "./worldCupMarketMapLayout";
import { WORLD_CUP_MARKET_STORES } from "./worldCupMarketStores";

describe("floor-directory map layout", () => {
  const layout = buildFloorMapLayout(WORLD_CUP_MARKET_STORES);
  it("draws exactly one block per store that has an existing display point", () => {
    expect(layout.blocks.length).toBe(WORLD_CUP_MARKET_MAP_PLACEMENTS.length);
    expect(new Set(layout.blocks.map((b) => b.storeId)).size).toBe(layout.blocks.length);
  });
  it("keeps blocks tap-sized and non-overlapping", () => {
    expect(FLOOR_MAP_BLOCK.width).toBeGreaterThanOrEqual(40);
    for (const a of layout.blocks) for (const b of layout.blocks) {
      if (a === b) continue;
      const apart = Math.abs(a.x - b.x) >= FLOOR_MAP_BLOCK.width || Math.abs(a.y - b.y) >= FLOOR_MAP_BLOCK.height;
      expect(apart).toBe(true);
    }
  });
  it("keeps each block near its approximate anchor", () => {
    const far = layout.blocks.map((b) => [b.storeId, Math.round(Math.hypot(b.x - b.anchorX, b.y - b.anchorY))] as const).filter(([, d]) => d > 60); expect(far.every(([, d]) => d < 100)).toBe(true);
  });
  it("is stable under category filtering", () => {
    const meat = buildFloorMapLayout(WORLD_CUP_MARKET_STORES.filter((s) => s.categoryGroup === "meat"));
    expect(meat.height).toBe(layout.height);
    expect(meat.blocks.every((b) => b.group === "meat")).toBe(true);
  });
  it("points station markers toward the stations", () => {
    const mangwon = layout.stations.find((s) => s.id === "mangwon")!;
    expect(Math.cos(mangwon.angle * Math.PI / 180)).toBeGreaterThan(0); // east-ish
  });
});
