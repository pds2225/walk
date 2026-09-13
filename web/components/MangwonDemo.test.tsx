// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MANGWON_STORES } from "../lib/mangwonStores";
import MangwonDemo from "./MangwonDemo";

vi.mock("./RoadviewViewer", () => ({
  default: () => <div data-testid="roadview-viewer">Google Street View mock</div>,
}));

describe("MangwonDemo", () => {
  afterEach(() => cleanup());

  it("실제 점포 목록과 확인 전 데이터를 표시한다", () => {
    render(<MangwonDemo onStartWalking={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "망원시장 리얼데이터" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "훈훈호떡" })).toBeTruthy();
    expect(screen.getAllByText("확인 중").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "Google Street View로 현장 확인" })).toBeTruthy();
  });

  it("점포 선택 후 여기로 가기는 해당 실제 navigationTarget을 전달한다", () => {
    const onStartWalking = vi.fn();
    render(<MangwonDemo onStartWalking={onStartWalking} />);
    const list = screen.getByTestId("mangwon-store-list");
    fireEvent.click(within(list).getByRole("button", { name: /우이락 망원본점/ }));
    fireEvent.click(screen.getByRole("button", { name: "여기로 가기" }));

    const target = MANGWON_STORES.find((store) => store.nameKo === "우이락 망원본점");
    expect(onStartWalking).toHaveBeenCalledWith({
      name: "우이락 망원본점",
      coordinate: target?.navigationTarget,
    });
    expect(screen.getByRole("heading", { name: "우이락 망원본점" })).toBeTruthy();
  });

  it("Google Street View 버튼은 기존 뷰어 연결 지점을 연다", () => {
    render(<MangwonDemo onStartWalking={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Google Street View로 현장 확인" }));
    expect(screen.getByTestId("roadview-viewer")).toBeTruthy();
  });
});
