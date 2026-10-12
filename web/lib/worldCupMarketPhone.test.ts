import { describe, expect, it } from "vitest";
import { KOREAN_PHONE_PATTERN, parseStorePhones } from "./worldCupMarketPhone";
import { WORLD_CUP_MARKET_STORES } from "./worldCupMarketStores";

describe("월드컵시장 점포 전화번호", () => {
  it("45개 점포의 모든 번호가 한국 전화번호 형식이고 tel: 링크는 숫자만 쓴다", () => {
    expect(WORLD_CUP_MARKET_STORES).toHaveLength(45);
    for (const store of WORLD_CUP_MARKET_STORES) {
      if (store.phone === null) continue;
      const parts = store.phone.split("/").map((part) => part.trim().replace(/~\d+$/, ""));
      for (const part of parts) expect(part, `${store.id} ${store.nameKo}`).toMatch(KOREAN_PHONE_PATTERN);
      const links = parseStorePhones(store.phone);
      expect(links, store.id).toHaveLength(parts.length);
      for (const link of links) expect(link.href).toMatch(/^tel:0\d{8,10}$/);
    }
  });

  it("블로그 오타 번호(0110-…)는 쓰지 않는다: 40은 간판 사진 번호, 43은 번호 없음", () => {
    const byId = (id: string) => WORLD_CUP_MARKET_STORES.find((store) => store.id === id)!;
    expect(byId("worldcup-market-40").phone).toBe("010-3182-1665");
    expect(byId("worldcup-market-43").phone).toBeNull();
    expect(WORLD_CUP_MARKET_STORES.some((store) => store.phone?.includes("0110"))).toBe(false);
  });

  it("여러 번호와 연번 표기를 나누고 잘못된 번호는 버린다", () => {
    expect(parseStorePhones("02-332-6625 / 010-5354-8682")).toEqual([
      { label: "02-332-6625", href: "tel:023326625" },
      { label: "010-5354-8682", href: "tel:01053548682" },
    ]);
    expect(parseStorePhones("02-323-0906~7")).toEqual([{ label: "02-323-0906~7", href: "tel:023230906" }]);
    expect(parseStorePhones("0110-3182-1665")).toEqual([]);
    expect(parseStorePhones(null)).toEqual([]);
  });
});
