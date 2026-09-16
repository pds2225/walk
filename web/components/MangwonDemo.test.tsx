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
  afterEach(() => cleanup());

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
  });

  it("저장·공유와 Popular Menu 전체 보기를 제공한다", () => {
    render(<MangwonDemo locale="ko" onStartWalking={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByRole("button", { name: "저장됨" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "전체 보기" }));
    expect(screen.getByText("아메리카노")).toBeTruthy();
    expect(screen.getByRole("button", { name: "공유" })).toBeTruthy();
  });

  it("Screen 02에서 Nearby 점포 선택이 360·지도·K-Navi CTA에 동일하게 연결되고 부적합 정면뷰는 대체하지 않는다", () => {
    const onStartWalking = vi.fn();
    render(<MangwonDemo locale="ko" onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: /주변 점포 · 360 · 지도/ }));
    expect(screen.getByRole("heading", { name: "주변 점포" })).toBeTruthy();
    expect(screen.getByTestId("mangwon-market-map")).toBeTruthy();
    expect(screen.getByTitle("훈훈호떡 Google Street View")).toBeTruthy();

    const wooyirakItems = screen.getAllByRole("listitem", { name: /우이락 망원본점/ });
    fireEvent.click(wooyirakItems[0]);

    const target = MANGWON_STORES.find((store) => store.nameKo === "우이락 망원본점");
    expect(screen.getByText("map:mangwon-wooyirak-main")).toBeTruthy();
    expect(screen.queryByTitle("우이락 망원본점 Google Street View")).toBeNull();
    expect(screen.getByText("사용 가능한 점포 정면뷰가 없습니다")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "여기로 가기" }));
    expect(onStartWalking).toHaveBeenCalledWith({ name: "우이락 망원본점", coordinate: target?.navigationTarget });
  });
});
