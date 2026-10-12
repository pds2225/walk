import { describe, expect, it } from "vitest";
import { WORLD_CUP_MARKET_STORES } from "./worldCupMarketStores";
import { WORLD_CUP_MARKET_NAME_READINGS } from "./worldCupMarketNameReadings";

// Katakana block + half-width/full-width variants, the choonpu mark, and a
// plain space (two-word store names such as "망원점" entries use one).
const KATAKANA_READING = /^[゠-ヿｰ、。 ]+$/;

describe("WORLD_CUP_MARKET_NAME_READINGS", () => {
  it("45개 점포 전체에 가타카나 읽기를 제공한다", () => {
    expect(Object.keys(WORLD_CUP_MARKET_STORES).length).toBeGreaterThan(0);
    for (const store of WORLD_CUP_MARKET_STORES) {
      const reading = WORLD_CUP_MARKET_NAME_READINGS[store.id];
      expect(reading, `${store.id} (${store.nameKo})`).toBeTruthy();
    }
    expect(Object.keys(WORLD_CUP_MARKET_NAME_READINGS)).toHaveLength(WORLD_CUP_MARKET_STORES.length);
  });

  it("각 읽기는 가타카나(및 공백)만 포함하고 한글을 담지 않는다", () => {
    for (const [id, reading] of Object.entries(WORLD_CUP_MARKET_NAME_READINGS)) {
      expect(reading, id).toMatch(KATAKANA_READING);
      expect(reading, id).not.toMatch(/[ᄀ-ᇿ㄰-㆏가-힣]/);
    }
  });

  it("데이터 맵의 키는 실제 점포 id와 정확히 일치한다", () => {
    const storeIds = new Set(WORLD_CUP_MARKET_STORES.map((store) => store.id));
    for (const id of Object.keys(WORLD_CUP_MARKET_NAME_READINGS)) {
      expect(storeIds.has(id), id).toBe(true);
    }
  });

  it("받침 ㅁ은 ム, 영어 외래어는 일본어 표준 표기로 읽는다", () => {
    const reading = (n: number) => WORLD_CUP_MARKET_NAME_READINGS[`worldcup-market-${String(n).padStart(2, "0")}`];
    expect(reading(8)).toBe("チュンナムスサン");
    expect(reading(24)).toBe("ナムドチョングァ");
    expect(reading(23)).toBe("サムヘスサン");
    expect(reading(6)).toMatch(/^クムゲ/);
    expect(reading(32)).toMatch(/キルム$/);
    expect(reading(34)).toMatch(/^キョンナム/);
    expect(reading(12)).toMatch(/ジョム$/);
    expect(reading(9)).toBe("ファッションタウン");
    expect(reading(33)).toBe("デザインデコ");
    expect(reading(44)).toBe("ハンソンカーテン");
    expect(reading(17)).toBe("スサンキング");
    expect(reading(20)).toMatch(/^ワールドカップ/);
    for (const value of Object.values(WORLD_CUP_MARKET_NAME_READINGS)) expect(value).not.toMatch(/ジョン(?: |$)/);
  });
});
