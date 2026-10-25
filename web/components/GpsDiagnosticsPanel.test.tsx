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
