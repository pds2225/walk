import { describe, expect, it } from "vitest";
import { MANGWON_PANORAMA_POINTS, MANGWON_STORES, getMangwonStore } from "./mangwonStores";

describe("망원시장 리얼데이터 Demo 점포 데이터", () => {
  it("훈훈호떡부터 우이락까지 조사된 corridor 점포와 5개 panorama 지점을 제공한다", () => {
    expect(MANGWON_STORES.length).toBeGreaterThan(5);
    expect(MANGWON_PANORAMA_POINTS).toHaveLength(5);
    expect(MANGWON_PANORAMA_POINTS[0]?.label).toBe("훈훈호떡");
    expect(MANGWON_PANORAMA_POINTS.at(-1)?.label).toBe("우이락 망원본점");
    expect(getMangwonStore("mangwon-hunhun-hotteok")?.storeLocation).toEqual({
      latitude: 37.5559174,
      longitude: 126.9063682,
      source: "Google Maps representative coordinate",
      verifiedAt: "2026-09-13",
      verificationStatus: "MULTI_SOURCE_VERIFIED",
    });
  });

  it("좌우·순서·출입구는 현장 확인 전 상태로 유지한다", () => {
    for (const store of MANGWON_STORES) {
      expect(store.navigationTarget.verificationStatus).toBe("FIELD_CHECK_REQUIRED");
      expect(store.corridorSide).toBe("UNKNOWN");
      expect(store.corridorOrder).toBeNull();
      expect(store.google.placeId).toBeNull();
      expect(store.google.webReference === null || /^g\/11/.test(store.google.webReference)).toBe(true);
    }
  });

  it("다른 세션에서 조사한 상세 메뉴·가격·구매 정보를 보존한다", () => {
    const hunhun = getMangwonStore("mangwon-hunhun-hotteok");
    expect(hunhun?.products[0]).toEqual({
      nameKo: "옥수수호떡",
      priceKrw: 1500,
      priceLabel: null,
      descriptionKo: "옥수수 반죽의 기본 호떡",
    });
    expect(hunhun?.purchaseInfo.takeout).toBe(true);
    expect(getMangwonStore("mangwon-qs-chicken")?.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nameKo: "닭강정 컵", priceKrw: 5000 }),
        expect.objectContaining({ nameKo: "닭강정 1마리반", priceKrw: 21000 }),
        expect.objectContaining({ nameKo: "사이즈 선택", priceKrw: null, priceLabel: "가격 변동" }),
      ]),
    );
    expect(getMangwonStore("mangwon-wooyirak-main")?.products).toEqual(
      expect.arrayContaining([expect.objectContaining({ nameKo: "오리지날 고추튀김", priceKrw: 12000 })]),
    );
  });

  it("위치·가격·이미지 상태는 확인된 값만 검증됨으로 표시한다", () => {
    for (const store of MANGWON_STORES) {
      expect(store.verification.location).toBe(store.storeLocation.verificationStatus);
      const representativePrice = store.representativeMenu?.priceWon;
      const hasPrice = typeof representativePrice === "number"
        || store.products.some((item) => item.priceKrw !== null || item.priceLabel !== null);
      expect(store.verification.prices).toBe(hasPrice ? "SINGLE_SOURCE_VERIFIED" : "UNKNOWN");
      expect(store.verification.images).toBe("RIGHTS_CHECK_REQUIRED");
      for (const storeImage of store.storeImages) {
        expect(storeImage.usageStatus).toBe("RIGHTS_CHECK_REQUIRED");
      }
    }
    expect(getMangwonStore("mangwon-jangteo-gukbap")?.verification.prices).toBe("UNKNOWN");
    expect(getMangwonStore("mangwon-jangteo-gukbap")?.verification.location).toBe("SINGLE_SOURCE_VERIFIED");
    expect(getMangwonStore("mangwon-mat-itneun-jip")?.representativeMenu?.priceWon).toBeNull();
    expect(getMangwonStore("mangwon-mat-itneun-jip")?.verification.prices).toBe("SINGLE_SOURCE_VERIFIED");
  });

  it("13개 점포 모두 거리 수준 영상이 있어 키가 있으면 거리뷰 대상이다", () => {
    expect(MANGWON_STORES).toHaveLength(13);
    const withPano = MANGWON_STORES.filter((store) => store.streetView.lastResolvedPanoId);
    const byLocation = MANGWON_STORES.filter((store) => !store.streetView.lastResolvedPanoId);
    expect(MANGWON_STORES.every((store) => store.streetView.available)).toBe(true);
    expect(withPano.map((store) => store.nameKo)).toEqual([
      "훈훈호떡",
      "맛있는집",
      "부산대원어묵",
      "큐스",
      "우이락 망원본점",
    ]);
    expect(byLocation.map((store) => store.nameKo)).toEqual([
      "망원시장손칼국수",
      "망원장터국밥",
      "망원튀맥집",
      "오공찬",
      "장충동한방족발",
      "무침프로젝트",
      "망원닭강정",
      "훈이네 빈대떡",
    ]);
  });
});
