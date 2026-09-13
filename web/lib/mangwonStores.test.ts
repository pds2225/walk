import { describe, expect, it } from "vitest";
import { MANGWON_STORES, getMangwonStore } from "./mangwonStores";

describe("망원시장 리얼데이터 Demo 점포 데이터", () => {
  it("명세의 5개 점포를 실제 좌표와 함께 제공한다", () => {
    expect(MANGWON_STORES).toHaveLength(5);
    expect(MANGWON_STORES.map((store) => store.nameKo)).toEqual([
      "훈훈호떡",
      "맛있는집",
      "부산대원어묵",
      "큐스닭강정",
      "우이락 망원본점",
    ]);
    expect(getMangwonStore("mangwon-hunhun-hotteok")?.storeLocation).toEqual({
      latitude: 37.5559174,
      longitude: 126.9063682,
      source: "Google Maps place coordinate",
      verifiedAt: "2026-09-13",
      verificationStatus: "MULTI_SOURCE_VERIFIED",
    });
  });

  it("구매 메뉴는 공개 출처를 저장하고 미확인 위치·사진은 추정하지 않는다", () => {
    for (const store of MANGWON_STORES) {
      expect(store.navigationTarget.verificationStatus).toBe("FIELD_CHECK_REQUIRED");
      expect(store.streetViewLocation).toBeNull();
      expect(store.corridorSide).toBe("UNKNOWN");
      expect(store.corridorOrder).toBeNull();
      expect(store.businessHours).not.toBeNull();
      expect(store.products.length).toBeGreaterThan(0);
      expect(store.products.every((item) => item.priceKrw !== null || item.priceLabel !== null)).toBe(true);
      expect(store.verification.products).toBe("SINGLE_SOURCE_VERIFIED");
      expect(store.verification.prices).toBe("SINGLE_SOURCE_VERIFIED");
      expect(store.storeImages).toEqual([]);
    }
  });

  it("구매 화면에 필요한 대표 메뉴와 가격을 구조화한다", () => {
    expect(getMangwonStore("mangwon-hunhun-hotteok")?.products[0]).toEqual({
      nameKo: "옥수수호떡",
      priceKrw: 1500,
      priceLabel: null,
      descriptionKo: "옥수수 반죽의 기본 호떡",
    });
    expect(getMangwonStore("mangwon-qs-chicken")?.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nameKo: "닭강정 컵", priceKrw: 5000 }),
        expect.objectContaining({ nameKo: "닭강정 1마리반", priceKrw: 21000 }),
        expect.objectContaining({ nameKo: "사이즈 선택", priceKrw: null, priceLabel: "가격 변동" }),
      ]),
    );
  });

  it("공식 목록 표기가 다른 큐스닭강정은 공식 출처를 비워 둔다", () => {
    const store = getMangwonStore("mangwon-qs-chicken");
    expect(store?.officialSource).toBeNull();
    expect(store?.verification.officialSource).toBe("UNKNOWN");
    expect(store?.streetView.quality).toBe("CORRIDOR_VISIBLE");
  });
});
