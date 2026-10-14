import { describe, expect, it } from "vitest";
import { buildFloorMapLayout, fitStallLabel, FLOOR_PLAN } from "./worldCupMarketFloorMap";
import { WORLD_CUP_MARKET_MAP_PLACEMENTS } from "./worldCupMarketMapLayout";
import { WORLD_CUP_MARKET_STORES } from "./worldCupMarketStores";

describe("floor-directory plan v2", () => {
  const layout = buildFloorMapLayout(WORLD_CUP_MARKET_STORES);
  it("draws one stall per store that has an existing display point, and every store has a group", () => {
    expect(layout.stalls.length).toBe(WORLD_CUP_MARKET_MAP_PLACEMENTS.length);
    expect(new Set(layout.stalls.map((s) => s.storeId)).size).toBe(layout.stalls.length);
    expect(WORLD_CUP_MARKET_STORES.every((s) => s.categoryGroup)).toBe(true);
  });
  it("tiles stalls edge to edge on both sides of the alley without overlap", () => {
    for (const side of [-1, 1] as const) {
      const col = layout.stalls.filter((s) => s.side === side).sort((a, b) => a.y - b.y);
      for (let i = 1; i < col.length; i++) expect(col[i]!.y).toBeGreaterThanOrEqual(col[i - 1]!.y + col[i - 1]!.height - 1e-6);
      for (const s of col) expect(s.height).toBeGreaterThanOrEqual(FLOOR_PLAN.stallHeight - 1e-6);
    }
    for (const s of layout.stalls) expect(s.side < 0 ? s.x + s.width : s.x).toBeCloseTo(s.side < 0 ? layout.alley.x : layout.alley.x + layout.alley.width);
  });
  it("is stable under category filtering", () => {
    const meat = buildFloorMapLayout(WORLD_CUP_MARKET_STORES.filter((s) => s.categoryGroup === "meat"));
    expect(meat.height).toBe(layout.height);
    for (const s of meat.stalls) expect(layout.stalls.find((t) => t.storeId === s.storeId)).toMatchObject({ x: s.x, y: s.y });
  });
  it("cuts the alley where OSM side streets cross it", () => {
    expect(layout.cuts.length).toBeGreaterThan(0);
  });
  it("shrinks, wraps to two lines, or falls back to number only", () => {
    expect(fitStallLabel("부부야채", 100, 40)).toMatchObject({ lines: ["부부야채"], fontSize: 12 });
    expect(fitStallLabel("국제기계떡방앗간 망원점", 70, 40)?.lines.length).toBe(2);
    expect(fitStallLabel("아주아주아주긴점포이름입니다정말로길어요", 40, 20)).toBeNull();
  });
});

import { fitPlanAffine, locateOnPlan } from "./worldCupMarketFloorMap";
describe("my location (on-device only)", () => {
  const layout = buildFloorMapLayout(WORLD_CUP_MARKET_STORES);
  const affine = fitPlanAffine(layout);
  const p = WORLD_CUP_MARKET_MAP_PLACEMENTS[0]!;
  it("places a store coordinate inside the plan near its stall", () => {
    const r = locateOnPlan(layout, affine, p.displayLocation.latitude, p.displayLocation.longitude, 10);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") { expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x).toBeLessThanOrEqual(layout.width); expect(r.y).toBeLessThanOrEqual(layout.height); }
  });
  it("rejects inaccurate fixes and points outside the market", () => {
    expect(locateOnPlan(layout, affine, p.displayLocation.latitude, p.displayLocation.longitude, 120).kind).toBe("inaccurate");
    expect(locateOnPlan(layout, affine, 37.5665, 126.978, 10).kind).toBe("outside");
  });
});
