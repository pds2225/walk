/**
 * 네이버 지역검색 응답 파싱 검증 — 파이썬 `_parse_naver_local_items` 와 같은 규칙.
 *
 * 좌표 규약(×10^7)과 한국 범위 검사가 어긋나면 엉뚱한 목적지로 안내하게 된다.
 */
import { describe, expect, it } from "vitest";
import { parseLocalItems } from "./naver";

/** 서울시청(37.5665, 126.978) 을 지역검색 좌표 규약(×10^7 정수)으로. */
const SEOUL = { mapx: String(Math.round(126.978 * 1e7)), mapy: String(Math.round(37.5665 * 1e7)) };

describe("parseLocalItems", () => {
  it("mapx/mapy 를 1e7 로 나눠 좌표로 읽는다", () => {
    const [hit] = parseLocalItems([{ ...SEOUL, title: "서울시청" }], "시청", null);

    expect(hit?.coordinate.latitude).toBeCloseTo(37.5665, 4);
    expect(hit?.coordinate.longitude).toBeCloseTo(126.978, 4);
  });

  it("title 의 <b> 하이라이트 태그를 지운다", () => {
    const [hit] = parseLocalItems(
      [{ ...SEOUL, title: "동네<b>치킨</b>", roadAddress: "서울 중구 세종대로 110" }],
      "치킨", null);

    expect(hit?.name).toBe("서울 중구 세종대로 110 동네치킨");
  });

  it("주소가 없으면 상호만 쓴다", () => {
    const [hit] = parseLocalItems([{ ...SEOUL, title: "동네치킨" }], "치킨", null);

    expect(hit?.name).toBe("동네치킨");
  });

  it("도로명 주소를 지번보다 먼저 쓴다", () => {
    const [hit] = parseLocalItems(
      [{ ...SEOUL, title: "가게", roadAddress: "도로명", address: "지번" }], "가게", null);

    expect(hit?.name).toBe("도로명 가게");
  });

  it("한국 범위를 벗어난 좌표는 버린다", () => {
    // 좌표계를 잘못 읽은 값 — 엉뚱한 곳으로 안내하느니 후보에서 빼는 게 낫다
    const hits = parseLocalItems(
      [{ mapx: "1269780000", mapy: "0", title: "적도어딘가" }], "x", null);

    expect(hits).toEqual([]);
  });

  it("좌표가 없거나 숫자가 아니면 버린다", () => {
    expect(parseLocalItems([{ title: "좌표없음" }], "x", null)).toEqual([]);
    expect(parseLocalItems([{ mapx: "abc", mapy: "def", title: "이상" }], "x", null)).toEqual([]);
  });

  it("현재 위치를 주면 직선거리를 붙인다", () => {
    const [hit] = parseLocalItems([{ ...SEOUL, title: "서울시청" }], "시청",
      { latitude: 37.5665, longitude: 126.978 });

    expect(hit?.distanceMeters).toBe(0);
  });

  it("현재 위치가 없으면 거리를 붙이지 않는다", () => {
    const [hit] = parseLocalItems([{ ...SEOUL, title: "서울시청" }], "시청", null);

    expect(hit?.distanceMeters).toBeUndefined();
  });

  it("상호도 주소도 없으면 검색어를 라벨로 쓴다", () => {
    const [hit] = parseLocalItems([{ ...SEOUL }], "빈검색", null);

    expect(hit?.name).toBe("빈검색");
  });
});
