// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WalkTimeReadout, { elapsedClock, remainingRouteSeconds, validRouteSeconds } from "./WalkTimeReadout";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("walk travel time calculations", () => {
  it("accepts only usable provider times", () => {
    expect(validRouteSeconds(160)).toBe(160);
    expect(validRouteSeconds(0)).toBe(0);
    expect(validRouteSeconds(null)).toBeNull();
    expect(validRouteSeconds(undefined)).toBeNull();
    expect(validRouteSeconds(Infinity)).toBeNull();
    expect(validRouteSeconds(-10)).toBeNull();
  });

  it("uses the active route distance and rejects unknown/invalid remaining distances", () => {
    expect(remainingRouteSeconds(360, 600, 200)).toBe(120);
    expect(remainingRouteSeconds(360, 600, 700)).toBe(360);
    expect(remainingRouteSeconds(360, 600, 0)).toBe(0);
    expect(remainingRouteSeconds(360, 0, 10)).toBeNull();
    expect(remainingRouteSeconds(360, 600, null)).toBeNull();
    expect(remainingRouteSeconds(360, 600, -2)).toBeNull();
    expect(remainingRouteSeconds(null, 600, 200)).toBeNull();
  });

  it("formats 0, minutes and multi-hour elapsed time", () => {
    expect(elapsedClock(0)).toBe("0:00");
    expect(elapsedClock(65)).toBe("1:05");
    expect(elapsedClock(3_661)).toBe("1:01:01");
    expect(elapsedClock(-5)).toBe("0:00");
  });
});

describe("walk travel time screen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T00:00:00Z"));
  });

  it("preview shows only the route-provider ETA, not a running trip clock", () => {
    render(<WalkTimeReadout locale="ko" phase="preview" totalSeconds={160} totalDistanceMeters={200} />);
    const time = screen.getByRole("timer");
    expect(time.textContent).toContain("예상 이동: 약 3분");
    expect(time.textContent).not.toContain("실제 이동");
    expect(time.textContent).not.toContain("도착 후");
  });

  it("keeps the actual clock across rerouting, freezes at arrival, then counts time since arrival", () => {
    const { rerender, unmount } = render(
      <WalkTimeReadout locale="ko" phase="navigating" totalSeconds={360} totalDistanceMeters={600} remainingMeters={400} />,
    );
    expect(screen.getByRole("timer").textContent).toContain("남은 예상: 약 4분");
    expect(screen.getByRole("timer").textContent).toContain("이동 경과: 0:00");

    act(() => {
      vi.setSystemTime(new Date("2026-11-12T00:01:04Z"));
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole("timer").textContent).toContain("이동 경과: 1:05");

    // Active-route values change; the elapsed clock must not restart.
    rerender(
      <WalkTimeReadout locale="ko" phase="navigating" totalSeconds={240} totalDistanceMeters={240} remainingMeters={120} />,
    );
    expect(screen.getByRole("timer").textContent).toContain("남은 예상: 약 2분");
    expect(screen.getByRole("timer").textContent).toContain("이동 경과: 1:05");

    rerender(
      <WalkTimeReadout locale="ko" phase="arrived" totalSeconds={240} totalDistanceMeters={240} remainingMeters={0} />,
    );
    expect(screen.getByRole("timer").textContent).toContain("실제 이동: 1:05");
    expect(screen.getByRole("timer").textContent).toContain("도착 후 경과(체류 참고): 0:00");

    act(() => {
      vi.setSystemTime(new Date("2026-11-12T00:01:21Z"));
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole("timer").textContent).toContain("실제 이동: 1:05");
    expect(screen.getByRole("timer").textContent).toContain("도착 후 경과(체류 참고): 0:17");

    // Unmounting the navigation screen stops its timer. A new trip resets it.
    unmount();
    render(<WalkTimeReadout locale="en" phase="navigating" totalSeconds={80} totalDistanceMeters={100} remainingMeters={50} />);
    expect(screen.getByRole("timer").textContent).toContain("Walking elapsed: 0:00");
  });

  it("does not invent an ETA if the route has no time or distance data", () => {
    render(<WalkTimeReadout locale="ko" phase="navigating" totalSeconds={null} totalDistanceMeters={null} remainingMeters={20} />);
    expect(screen.getByRole("timer").textContent).toContain("예상 이동: 확인 불가");
    expect(screen.getByRole("timer").textContent).toContain("남은 예상: 확인 불가");
  });
});

// Recorded public-place production route response: 521m / 464s.
describe("remaining time visibility with production route data", () => {
  it("keeps the field visible before GPS, then uses distance-scaled provider time", () => {
    const { rerender } = render(<WalkTimeReadout locale="ko" phase="navigating" totalSeconds={464} totalDistanceMeters={521} remainingMeters={null} />);
    expect(screen.getByRole("timer").textContent).toContain("남은 예상: 위치 확인 중");
    rerender(<WalkTimeReadout locale="ko" phase="navigating" totalSeconds={464} totalDistanceMeters={521} remainingMeters={260.5} />);
    expect(remainingRouteSeconds(464, 521, 260.5)).toBe(232);
    expect(screen.getByRole("timer").textContent).toContain("남은 예상: 약 4분");
  });
});
