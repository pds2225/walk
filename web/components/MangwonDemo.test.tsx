// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MANGWON_STORES } from "../lib/mangwonStores";
import type { Locale } from "../lib/i18n";
import MangwonDemo from "./MangwonDemo";

vi.mock("./MangwonMarketMap", () => ({
  default: ({ selectedId }: { selectedId: string }) => <div data-testid="mangwon-market-map">map:{selectedId}</div>,
}));

describe("MangwonDemo Mobile Screen 01", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
  });

  it("첫 화면에서 큰 대표 이미지와 점포 정보 위계를 보여주고 360·지도를 메인에서 숨긴다", () => {
    render(<MangwonDemo locale="ko" onStartWalking={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "망원시장 점포 안내" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "훈훈호떡" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "훈훈호떡 대표 이미지" })).toBeTruthy();
    expect(screen.getByText("인기 메뉴")).toBeTruthy();
    expect(screen.getAllByText("옥수수호떡").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1,500원").length).toBeGreaterThan(0);
    expect(screen.getByText("점포 안내")).toBeTruthy();
    expect(screen.queryByTitle("훈훈호떡 Google Street View")).toBeNull();
    expect(screen.queryByTestId("mangwon-market-map")).toBeNull();
    expect(screen.queryByText(/37\.\d+/)).toBeNull();
  });

  it("다른 점포를 선택하면 hero 이미지·메뉴·가격·영업시간이 즉시 바뀌고 K-Navi를 호출한다", () => {
    const onStartWalking = vi.fn();
    render(<MangwonDemo locale="ko" onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: "우이락 망원본점" }));
    expect(screen.getByRole("heading", { name: "우이락 망원본점" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "우이락 망원본점 대표 이미지" })).toBeTruthy();
    expect(screen.getAllByText("오리지날 고추튀김").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12,000원").length).toBeGreaterThan(0);
    expect(screen.getByText("매일 11:00–22:00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "여기로 가기" }));
    const target = MANGWON_STORES.find((store) => store.nameKo === "우이락 망원본점");
    expect(onStartWalking).toHaveBeenCalledWith({ name: "우이락 망원본점", coordinate: target?.navigationTarget });
  });

  it("KO와 EN을 같은 화면에서 전환하고 영어 점포·메뉴·CTA를 표시한다", () => {
    let locale: Locale = "ko";
    const onLocaleChange = vi.fn((nextLocale: Locale) => { locale = nextLocale; });
    const onStartWalking = vi.fn();
    const { rerender } = render(<MangwonDemo locale={locale} onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(onLocaleChange).toHaveBeenCalledWith("en");
    rerender(<MangwonDemo locale={locale} onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);

    expect(screen.getByRole("heading", { name: "Hunhun Hotteok" })).toBeTruthy();
    expect(screen.getByText("Hotteok · Dessert")).toBeTruthy();
    expect(screen.getAllByText("Corn Hotteok").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₩1,500").length).toBeGreaterThan(0);
    expect(screen.getByText("Popular Menu")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start Walking Guide" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "JA" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ZH" })).toBeTruthy();
  });

  it("JA와 ZH 헤더로 바꾸면 점포·메뉴·가격·CTA가 해당 언어로 바뀐다", () => {
    let locale: Locale = "ko";
    const onLocaleChange = vi.fn((nextLocale: Locale) => { locale = nextLocale; });
    const onStartWalking = vi.fn();
    const { rerender } = render(<MangwonDemo locale={locale} onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: "JA" }));
    expect(onLocaleChange).toHaveBeenCalledWith("ja");
    rerender(<MangwonDemo locale={locale} onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);

    expect(screen.getByRole("heading", { name: "フンフンホットク" })).toBeTruthy();
    expect(screen.getByText("ホットク・デザート")).toBeTruthy();
    expect(screen.getAllByText("トウモロコシホットク").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₩1,500").length).toBeGreaterThan(0);
    expect(screen.getByText("人気メニュー")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ここへ歩いて行く" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /周辺の店舗 · 360 · 地図/ }));
    expect(screen.getByRole("heading", { name: "周辺の店舗" })).toBeTruthy();
    expect(screen.getByText("利用できる店舗正面ビューがありません")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    fireEvent.click(screen.getByRole("button", { name: "ZH" }));
    rerender(<MangwonDemo locale="zh" onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "熏熏糖饼" })).toBeTruthy();
    expect(screen.getByText("糖饼·甜点")).toBeTruthy();
    expect(screen.getAllByText("玉米糖饼").length).toBeGreaterThan(0);
    expect(screen.getByText("热门菜单")).toBeTruthy();
    expect(screen.getByRole("button", { name: "开始步行导航" })).toBeTruthy();
  });

  it("저장·공유와 Popular Menu 전체 보기를 제공한다", () => {
    render(<MangwonDemo locale="ko" onStartWalking={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByRole("button", { name: "저장됨" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "전체 보기" }));
    expect(screen.getByText("아메리카노")).toBeTruthy();
    expect(screen.getByRole("button", { name: "공유" })).toBeTruthy();
  });

  it("대표 메뉴 가격이 없으면 다른 상품 가격을 대표 가격으로 보여주지 않는다", () => {
    render(<MangwonDemo locale="ko" onStartWalking={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "맛있는집" }));
    const priceLabel = screen.getByText("가격");
    const priceValue = priceLabel.closest("div")?.querySelector("dd");
    expect(priceValue?.textContent).toBe("확인 필요");
    expect(screen.getAllByText("오징어튀김 김밥").length).toBeGreaterThan(0);
    expect(screen.getAllByText("6,000원").length).toBeGreaterThan(0);
  });

  it("Screen 02에서 Nearby 점포 선택이 지도·K-Navi CTA에 동일하게 연결되고 미검증 corridor pano는 정면뷰로 표시하지 않는다", async () => {
    const onStartWalking = vi.fn();
    render(<MangwonDemo locale="ko" onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: /주변 점포 · 360 · 지도/ }));
    expect(screen.getByRole("heading", { name: "주변 점포" })).toBeTruthy();
    expect(await screen.findByTestId("mangwon-market-map")).toBeTruthy();
    expect(screen.queryByTitle("훈훈호떡 Google Street View")).toBeNull();
    expect(screen.getByText("사용 가능한 점포 정면뷰가 없습니다")).toBeTruthy();

    const wooyirakItem = screen.getAllByRole("listitem", { name: /우이락 망원본점/ })[0];
    if (!wooyirakItem) throw new Error("우이락 망원본점 listitem이 없습니다");
    fireEvent.click(wooyirakItem);

    const target = MANGWON_STORES.find((store) => store.nameKo === "우이락 망원본점");
    expect(screen.getByText("map:mangwon-wooyirak-main")).toBeTruthy();
    expect(screen.queryByTitle("우이락 망원본점 Google Street View")).toBeNull();
    expect(screen.getByText("사용 가능한 점포 정면뷰가 없습니다")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "여기로 가기" }));
    expect(onStartWalking).toHaveBeenCalledWith({ name: "우이락 망원본점", coordinate: target?.navigationTarget });
  });

  it("?store= deep link로 특정 점포 상세에 직접 진입하고 점포 변경 시 URL을 갱신한다", async () => {
    window.history.replaceState({}, "", "/?store=mangwon-wooyirak-main");
    render(<MangwonDemo locale="ko" onStartWalking={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "우이락 망원본점" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "훈훈호떡" }));
    expect(window.location.search).toContain("store=mangwon-hunhun-hotteok");
  });
});
