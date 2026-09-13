// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MANGWON_PANORAMA_POINTS, MANGWON_STORES } from "../lib/mangwonStores";
import MangwonDemo from "./MangwonDemo";

vi.mock("next/dynamic", () => ({
  default: () => function MockDynamicMap() {
    return <div data-testid="mangwon-market-map" />;
  },
}));

vi.mock("./RoadviewViewer", () => ({
  default: ({ title }: { title?: string }) => <div data-testid="roadview-viewer">{title ?? "Google Street View mock"}</div>,
}));

describe("MangwonDemo", () => {
  afterEach(() => cleanup());

  it("360 파노라마와 첫 점포 카드에 메뉴·가격·영업시간을 즉시 표시한다", () => {
    render(<MangwonDemo locale="ko" onStartWalking={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "망원시장 360 산책" })).toBeTruthy();
    expect(screen.getByTestId("roadview-viewer")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "훈훈호떡" })).toBeTruthy();
    expect(screen.getByText("옥수수호떡")).toBeTruthy();
    expect(screen.getByText("1,500원")).toBeTruthy();
    expect(screen.getByText("화–일 11:00–20:30 · 월요일 휴무")).toBeTruthy();
    expect(screen.getByRole("button", { name: "상세보기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "여기로 가기" })).toBeTruthy();
    expect(screen.queryByText(/37\.\d+/)).toBeNull();
  });

  it("핫스팟과 앞·뒤 포인트 이동으로 5개 연결 지점을 전환한다", () => {
    render(<MangwonDemo locale="ko" onStartWalking={vi.fn()} />);

    expect(MANGWON_PANORAMA_POINTS).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "뒤 포인트" }));
    expect(screen.getByRole("heading", { name: "부산대원어묵" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /우이락 망원본점/ }));
    expect(screen.getByRole("heading", { name: "우이락 망원본점" })).toBeTruthy();
  });

  it("상세보기는 조사된 메뉴 목록을 열고 여기로 가기는 기존 K-Navi 목적지를 전달한다", () => {
    const onStartWalking = vi.fn();
    render(<MangwonDemo locale="ko" onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: "상세보기" }));
    expect(screen.getByTestId("mangwon-detail-disclosure")).toBeTruthy();
    expect(screen.getByText("치즈닝호떡")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /우이락 망원본점/ }));
    fireEvent.click(screen.getByRole("button", { name: "여기로 가기" }));
    const target = MANGWON_STORES.find((store) => store.nameKo === "우이락 망원본점");
    expect(onStartWalking).toHaveBeenCalledWith({ name: "우이락 망원본점", coordinate: target?.navigationTarget });
  });

  it("일반 지도는 보조 탭에서 열고 위치 권한을 요청한다", () => {
    const watchPosition = vi.fn((_success: PositionCallback) => 7);
    const clearWatch = vi.fn();
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { watchPosition, clearWatch } });
    render(<MangwonDemo locale="ko" onStartWalking={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "일반 지도" }));
    expect(screen.getByTestId("mangwon-market-map")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "내 위치 표시" }));
    expect(watchPosition).toHaveBeenCalledTimes(1);
  });
});
