/**
 * 카카오 로컬 응답 파싱 검증 — 파이썬 `_parse_kakao_documents` 와 같은 규칙.
 *
 * 좌표 규약이 네이버와 다르다(x=경도/y=위도 문자열 vs mapx/mapy ×10^7 정수).
 * 여기서 어긋나면 엉뚱한 목적지로 안내하게 된다.
 */
import { describe, expect, it } from "vitest";
import { parseKakaoDocuments } from "./kakao";

/** 서울시청 — 카카오는 x=경도, y=위도를 문자열로 준다. */
const SEOUL = { x: "126.9780", y: "37.5665" };

describe("parseKakaoDocuments", () => {
  it("x=경도, y=위도로 읽는다 (네이버와 규약이 반대)", () => {
    const [hit] = parseKakaoDocuments([{ ...SEOUL, place_name: "서울시청" }], "시청", null);

    expect(hit?.coordinate.latitude).toBeCloseTo(37.5665, 4);
    expect(hit?.coordinate.longitude).toBeCloseTo(126.978, 4);
  });

  it("도로명 주소 뒤에 상호를 붙인다 (네이버와 같은 표시 형식)", () => {
    const [hit] = parseKakaoDocuments(
      [{ ...SEOUL, place_name: "동네치킨", road_address_name: "서울 중구 세종대로 110" }],
      "치킨", null);

    expect(hit?.name).toBe("서울 중구 세종대로 110 동네치킨");
  });

  it("도로명이 없으면 지번 주소를 쓴다", () => {
    const [hit] = parseKakaoDocuments(
      [{ ...SEOUL, place_name: "가게", address_name: "서울 중구 태평로1가 31" }], "가게", null);

    expect(hit?.name).toBe("서울 중구 태평로1가 31 가게");
  });

  it("주소가 없으면 상호만 쓴다", () => {
    const [hit] = parseKakaoDocuments([{ ...SEOUL, place_name: "동네치킨" }], "치킨", null);

    expect(hit?.name).toBe("동네치킨");
  });

  it("한국 범위를 벗어난 좌표는 버린다", () => {
    // x/y 를 뒤집어 보낸 응답 — 그대로 쓰면 엉뚱한 곳으로 안내한다
    const hits = parseKakaoDocuments(
      [{ x: "37.5665", y: "126.9780", place_name: "뒤집힘" }], "x", null);

    expect(hits).toEqual([]);
  });

  it("좌표가 없거나 숫자가 아니면 버린다", () => {
    expect(parseKakaoDocuments([{ place_name: "좌표없음" }], "x", null)).toEqual([]);
    expect(parseKakaoDocuments([{ x: "abc", y: "def", place_name: "이상" }], "x", null)).toEqual([]);
  });

  it("현재 위치를 주면 직선거리를 붙인다", () => {
    const [hit] = parseKakaoDocuments([{ ...SEOUL, place_name: "서울시청" }], "시청",
      { latitude: 37.5665, longitude: 126.978 });

    expect(hit?.distanceMeters).toBe(0);
  });

  it("현재 위치가 없으면 거리를 붙이지 않는다", () => {
    const [hit] = parseKakaoDocuments([{ ...SEOUL, place_name: "서울시청" }], "시청", null);

    expect(hit?.distanceMeters).toBeUndefined();
  });

  it("상호도 주소도 없으면 검색어를 라벨로 쓴다", () => {
    const [hit] = parseKakaoDocuments([{ ...SEOUL }], "빈검색", null);

    expect(hit?.name).toBe("빈검색");
  });
});
