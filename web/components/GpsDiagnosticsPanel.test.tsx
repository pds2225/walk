// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { moveCoordinateByMeters } from "@walk/route-engine";
import type { Fix } from "../lib/useGeolocation";
import GpsDiagnosticsPanel from "./GpsDiagnosticsPanel";

const origin = { latitude: 37.5665, longitude: 126.978 };
function fix(east: number, t: number, acc: number = 8): Fix {
  return {
    ...moveCoordinateByMeters(origin, east, 0),
    timestampMs: t,
    accuracyMeters: acc,
    speedMetersPerSecond: null,
    headingDegrees: null,
  };
}
afterEach(cleanup);

describe("접힌 GPS 진단 패널", () => {
  it("처음에는 접혀 있으며 수신된 위치의 정확도와 표본 수를 보여준다", async () => {
    const view = render(<GpsDiagnosticsPanel fix={fix(0, 1000)} compassHeading={null} movementHeading={null} error={null} locale="ko" />);
    const details = view.container.querySelector("details");
    expect(details?.open).toBe(false);
    await waitFor(() => expect(screen.getByText("GPS 상태 · 좋음")).toBeTruthy());
    fireEvent.click(view.container.querySelector("summary")!);
    expect(details?.open).toBe(true);
    expect(screen.getByText("±8m")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("방향 정보 없음")).toBeTruthy();
  });

  it("GPS 급변을 표시하되 다음 정상 fix부터 상태가 회복된다", async () => {
    const view = render(<GpsDiagnosticsPanel fix={fix(0, 1000)} compassHeading={null} movementHeading={null} error={null} locale="ko" />);
    view.rerender(<GpsDiagnosticsPanel fix={fix(120, 2000)} compassHeading={null} movementHeading={null} error={null} locale="ko" />);
    await waitFor(() => expect(screen.getByText("GPS 상태 · 위치 급변 의심")).toBeTruthy());
    fireEvent.click(view.container.querySelector("summary")!);
    expect(screen.getByText("위치 급변 의심 횟수")).toBeTruthy();
    view.rerender(<GpsDiagnosticsPanel fix={fix(1, 3000)} compassHeading={270} movementHeading={90} error={null} locale="ko" />);
    await waitFor(() => expect(screen.getByText("GPS 상태 · 좋음")).toBeTruthy());
    expect(screen.getByText("기기 나침반")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });


  it("50m 초과 GPS 측정이 거부되면 오래된 수용 위치를 현재 측정처럼 표시하지 않는다", async () => {
    const f1 = fix(0, 1000, 5);
    const f2 = fix(1, 2000, 5);
    const f3 = fix(1, 3000, 5);
    const view = render(<GpsDiagnosticsPanel fix={f1} compassHeading={null} movementHeading={null} error={null} locale="ko" />);
    view.rerender(<GpsDiagnosticsPanel fix={f2} compassHeading={null} movementHeading={null} error={null} locale="ko" />);
    view.rerender(<GpsDiagnosticsPanel fix={f3} compassHeading={null} movementHeading={null} error={null} locale="ko" />);
    await waitFor(() => expect(screen.getByText("GPS 상태 · 좋음")).toBeTruthy());
    fireEvent.click(view.container.querySelector("summary")!);
    expect(screen.getByText("수용 위치 표본 수")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("정지 추정")).toBeTruthy();

    // useWatchPosition은 accuracy > 50m인 측정을 fix로 전달하지 않고 error만 갱신한다.
    const weakSignal = "위치 신호가 약해 현재 위치를 잠시 유지합니다.";
    view.rerender(<GpsDiagnosticsPanel fix={f3} compassHeading={null} movementHeading={null} error={weakSignal} locale="ko" />);
    await waitFor(() => expect(screen.getByText("GPS 상태 · 불안정")).toBeTruthy());
    expect(screen.getByText("현재 GPS 측정")).toBeTruthy();
    expect(screen.getByText("확인 불가 (새 위치 반영 안 됨)")).toBeTruthy();
    expect(screen.getByText("마지막 수용 위치 오차")).toBeTruthy();
    expect(screen.getByText("±5m")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("정지 추정")).toBeTruthy();

    view.rerender(<GpsDiagnosticsPanel fix={fix(2, 4000, 10)} compassHeading={null} movementHeading={null} error={null} locale="ko" />);
    await waitFor(() => expect(screen.getByText("±10m")).toBeTruthy());
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByText("확인 불가 (새 위치 반영 안 됨)")).toBeNull();
    expect(screen.getByText("GPS 상태 · 좋음")).toBeTruthy();
  });

  it("위치 급변 표시보다 GPS 수신 오류를 우선 보여준다", async () => {
    const jumped = fix(120, 2000);
    const view = render(<GpsDiagnosticsPanel fix={fix(0, 1000)} compassHeading={null} movementHeading={null} error={null} locale="ko" />);
    view.rerender(<GpsDiagnosticsPanel fix={jumped} compassHeading={null} movementHeading={null} error={null} locale="ko" />);
    await waitFor(() => expect(screen.getByText("GPS 상태 · 위치 급변 의심")).toBeTruthy());
    view.rerender(<GpsDiagnosticsPanel fix={jumped} compassHeading={null} movementHeading={null} error="GPS timeout" locale="ko" />);
    expect(screen.getByText("GPS 상태 · 불안정")).toBeTruthy();
  });

  it.each([
    ["ko", "현재 GPS 측정", "확인 불가 (새 위치 반영 안 됨)"],
    ["en", "Current GPS reading", "Unavailable (no new fix accepted)"],
    ["ja", "現在のGPS測定", "確認不可（新しい位置は未反映）"],
    ["zh", "当前GPS测量", "无法确认（未更新有效位置）"],
  ] as const)("GPS 오류 시 %s 안내문이 오래된 수용값과 현재 측정을 구분한다", (locale, label, unavailable) => {
    const view = render(<GpsDiagnosticsPanel fix={fix(0, 1000)} compassHeading={null} movementHeading={null} error="GPS timeout" locale={locale} />);
    fireEvent.click(view.container.querySelector("summary")!);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(unavailable)).toBeTruthy();
  });

  it("다국어·GPS 신호 오류를 보여주고 재마운트 시 진단 기록을 초기화한다", async () => {
    const view = render(<GpsDiagnosticsPanel fix={fix(0, 1000, 40)} compassHeading={null} movementHeading={90} error="GPS timeout" locale="en" />);
    await waitFor(() => expect(screen.getByText("GPS status · Weak")).toBeTruthy());
    fireEvent.click(view.container.querySelector("summary")!);
    expect(screen.getByText("GPS movement")).toBeTruthy();
    view.unmount();
    render(<GpsDiagnosticsPanel fix={null} compassHeading={null} movementHeading={null} error={null} locale="ja" />);
    expect(screen.getByText("GPS状態 · 確認中")).toBeTruthy();
  });
});
