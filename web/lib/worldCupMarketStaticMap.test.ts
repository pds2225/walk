import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORLD_CUP_MARKET_MAP_PLACEMENTS, WORLD_CUP_MARKET_PIN_SPACING } from "./worldCupMarketMapLayout";
import {
  layoutWorldCupMarketStaticMapPins,
  projectToStaticMap,
  WORLD_CUP_MARKET_STATIC_MAP,
  type WorldCupMarketStaticMapConfig,
} from "./worldCupMarketStaticMap";

const bounds = WORLD_CUP_MARKET_STATIC_MAP.bounds!;
const ids = WORLD_CUP_MARKET_MAP_PLACEMENTS.map((placement) => placement.storeId);

describe("월드컵시장 고정 지도 투영", () => {
  it("이미지 네 모서리와 중앙을 0–100% 로 투영하고 경계 밖은 버린다", () => {
    expect(projectToStaticMap({ latitude: bounds.north, longitude: bounds.west }, bounds)).toEqual({ x: 0, y: 0 });
    const corner = projectToStaticMap({ latitude: bounds.south, longitude: bounds.east }, bounds)!;
    expect(corner.x).toBeCloseTo(100, 6);
    expect(corner.y).toBeCloseTo(100, 6);
    const middle = projectToStaticMap({ latitude: (bounds.north + bounds.south) / 2, longitude: (bounds.east + bounds.west) / 2 }, bounds)!;
    expect(middle.x).toBeCloseTo(50, 6);
    expect(middle.y).toBeCloseTo(50, 1);
    expect(projectToStaticMap({ latitude: bounds.north + 0.001, longitude: bounds.west }, bounds)).toBeNull();
    expect(projectToStaticMap({ latitude: bounds.south, longitude: bounds.east + 0.001 }, bounds)).toBeNull();
  });

  it("45개 점포 표시 좌표가 모두 여백을 두고 이미지 안에 들어간다", () => {
    expect(WORLD_CUP_MARKET_MAP_PLACEMENTS).toHaveLength(45);
    for (const placement of WORLD_CUP_MARKET_MAP_PLACEMENTS) {
      const point = projectToStaticMap(placement.displayLocation, bounds);
      expect(point, placement.storeId).not.toBeNull();
      expect(point!.x).toBeGreaterThan(10);
      expect(point!.x).toBeLessThan(90);
      expect(point!.y).toBeGreaterThan(10);
      expect(point!.y).toBeLessThan(90);
    }
  });

  it("45개 핀이 서로 겹치지 않게 배치되고 필터 후에도 같은 점포는 같은 표시 좌표를 쓴다", () => {
    const pins = layoutWorldCupMarketStaticMapPins(ids);
    expect(pins).toHaveLength(45);
    const { width, height } = WORLD_CUP_MARKET_STATIC_MAP;
    for (const [index, pin] of pins.entries()) {
      for (const other of pins.slice(index + 1)) {
        const distance = Math.hypot((pin.x - other.x) / 100 * width, (pin.y - other.y) / 100 * height);
        expect(distance).toBeGreaterThanOrEqual(WORLD_CUP_MARKET_PIN_SPACING - 0.001);
      }
    }
    const subset = layoutWorldCupMarketStaticMapPins(ids.slice(0, 5));
    for (const pin of subset) {
      const full = pins.find((item) => item.storeId === pin.storeId)!;
      expect(pin.anchorX).toBeCloseTo(full.anchorX, 9);
      expect(pin.anchorY).toBeCloseTo(full.anchorY, 9);
    }
  });

  it("지리 좌표 없는 공식 배치도로 바꾸면 점포별 x/y 지정값만 사용한다", () => {
    const layoutMap: WorldCupMarketStaticMapConfig = { ...WORLD_CUP_MARKET_STATIC_MAP, bounds: null };
    expect(layoutWorldCupMarketStaticMapPins(ids, layoutMap, {})).toHaveLength(0);
    const [pin] = layoutWorldCupMarketStaticMapPins(ids, layoutMap, { [ids[0]!]: { x: 50, y: 50 } });
    expect(pin?.storeId).toBe(ids[0]);
    expect(pin?.anchorX).toBe(50);
    expect(pin?.anchorY).toBe(50);
  });

  it("설정한 이미지 파일이 public 에 있고 모바일용으로 가볍다", () => {
    const file = new URL(`../public${WORLD_CUP_MARKET_STATIC_MAP.src}`, import.meta.url);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThan(200_000);
    expect(WORLD_CUP_MARKET_STATIC_MAP.attribution.label).toContain("OpenStreetMap");
  });
});
