// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "../lib/i18n";
import WorldCupMarketDemo from "./WorldCupMarketDemo";

vi.mock("./WorldCupMarketMap", () => ({
  default: ({ selectedId }: { selectedId: string }) => <div data-testid="worldcup-market-map">map:{selectedId}</div>,
}));

describe("World Cup Market demo", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    window.history.replaceState({}, "", "/");
  });

  it("첫 화면에서 블로그 점포 정보만 보여주고 지도 핀은 열지 않는다", () => {
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "월드컵시장 점포 안내" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "부부야채" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "부부야채 대표 이미지" })).toBeTruthy();
    expect(screen.getByText("서울 마포구 망원로7길 31")).toBeTruthy();
    expect(screen.getByText("02-2601-1777")).toBeTruthy();
    expect(screen.getAllByText("고구마").length).toBeGreaterThan(0);
    expect(screen.getByText("08:00 ~ 19:00 (일요일 휴무)")).toBeTruthy();
    const priceLabel = screen.getByText("가격");
    expect(priceLabel.closest("div")?.querySelector("dd")?.textContent).toBe("미확인");
    expect(screen.queryByTestId("worldcup-market-map")).toBeNull();
    expect(screen.queryByText(/37\.\d+/)).toBeNull();
  });

  it("다른 점포를 고르면 블로그에 적힌 메뉴와 시간이 바뀌고, 좌표가 없으면 도보 안내를 시작하지 않는다", () => {
    const onStartWalking = vi.fn();
    render(<WorldCupMarketDemo locale="ko" onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: "무진장전집" }));
    expect(screen.getByRole("heading", { name: "무진장전집" })).toBeTruthy();
    expect(screen.getAllByText("야채곱창").length).toBeGreaterThan(0);
    expect(screen.getByText("11:00 ~ 23:00")).toBeTruthy();
    expect(screen.getByText("02-334-8295")).toBeTruthy();
    const priceLabel = screen.getByText("가격");
    expect(priceLabel.closest("div")?.querySelector("dd")?.textContent).toBe("미확인");
    expect(screen.queryByText(/\d+원/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "여기로 가기" }));
    expect(onStartWalking).not.toHaveBeenCalled();
  });

  it("슬로건의 3000원을 메뉴 가격으로 올리지 않는다", () => {
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "무진장맛집" }));
    expect(screen.getAllByText(/3000원의 행복/).length).toBeGreaterThan(0);
    const priceLabel = screen.getByText("가격");
    expect(priceLabel.closest("div")?.querySelector("dd")?.textContent).toBe("미확인");
    expect(screen.queryByText("3,000원")).toBeNull();
  });

  it("KO EN JA ZH 헤더를 전환하고 블로그에 있는 영어·중국어 이름만 바꾼다", () => {
    let locale: Locale = "ko";
    const onLocaleChange = vi.fn((nextLocale: Locale) => { locale = nextLocale; });
    const onStartWalking = vi.fn();
    const { rerender } = render(<WorldCupMarketDemo locale={locale} onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    rerender(<WorldCupMarketDemo locale="en" onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "Bubu Vegetables" })).toBeTruthy();
    expect(screen.getByText("채소")).toBeTruthy();
    expect(screen.getAllByText("고구마").length).toBeGreaterThan(0);
    expect(screen.getByText("Popular Menu")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start Walking Guide" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "JA" }));
    rerender(<WorldCupMarketDemo locale="ja" onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "부부야채" })).toBeTruthy();
    expect(screen.getByText("人気メニュー")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ここへ歩いて行く" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "ZH" }));
    rerender(<WorldCupMarketDemo locale="zh" onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "부부야채" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "嘉樂農產物" }));
    expect(screen.getByRole("heading", { name: "嘉樂農產物" })).toBeTruthy();
    expect(screen.getByText("热门菜单")).toBeTruthy();
    expect(screen.getByRole("button", { name: "开始步行导航" })).toBeTruthy();
  });

  it("저장과 공유 버튼을 제공한다", () => {
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByRole("button", { name: "저장됨" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "공유" })).toBeTruthy();
  });

  it("주변 화면은 주소와 미확인 위치를 보여주고 키가 있어도 거리뷰를 열지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const onStartWalking = vi.fn();
    render(<WorldCupMarketDemo locale="ko" onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: /주변 점포 · 360 · 지도/ }));
    expect(screen.getByRole("heading", { name: "주변 점포" })).toBeTruthy();
    expect(screen.getByText("서울 마포구 망원로7길 31")).toBeTruthy();
    expect(screen.getByText("미확인")).toBeTruthy();
    expect(screen.queryByTestId("worldcup-market-map")).toBeNull();
    expect(screen.getByText("사용 가능한 점포 정면뷰가 없습니다")).toBeTruthy();
    expect(screen.queryByTitle(/거리 뷰/)).toBeNull();

    const garak = screen.getAllByRole("listitem", { name: "가락농산물" })[0];
    if (!garak) throw new Error("가락농산물 listitem이 없습니다");
    fireEvent.click(garak);
    expect(screen.getByText("서울 마포구 망원로7길 23")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "여기로 가기" }));
    expect(onStartWalking).not.toHaveBeenCalled();
  });

  it("?store= deep link로 특정 점포 상세에 직접 진입하고 점포 변경 시 URL을 갱신한다", async () => {
    window.history.replaceState({}, "", "/worldcup-market?store=worldcup-market-45");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "장터국밥" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "부부야채" }));
    expect(window.location.search).toContain("store=worldcup-market-01");
  });
});
