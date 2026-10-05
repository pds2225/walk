// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { moveCoordinateByMeters } from "@walk/route-engine";
import type { Coordinate } from "@walk/route-engine";
import type { Fix } from "./useGeolocation";
import type { RouteResponse } from "./types";
import { useNavigation } from "./useNavigation";
import { SpeechQueue } from "./voice";

const ORIGIN: Coordinate = { latitude: 37.5665, longitude: 126.978 };
const TURN_ROUTE: RouteResponse = {
  route: {
    polyline: [ORIGIN, moveCoordinateByMeters(ORIGIN, 40, 0), moveCoordinateByMeters(ORIGIN, 40, 100)],
    turnPoints: [{ id: "left-1", coordinate: moveCoordinateByMeters(ORIGIN, 40, 0), routeIndex: 1, direction: "left" }],
  },
  totalDistanceMeters: 140,
  totalSeconds: 100,
  turnDescriptions: {},
  source: "tmap",
};
const STRAIGHT_ROUTE: RouteResponse = {
  ...TURN_ROUTE,
  route: { polyline: [ORIGIN, moveCoordinateByMeters(ORIGIN, 200, 0)], turnPoints: [] },
};

function fix(east: number, north: number, timestampMs: number, accuracyMeters: number | null = 25, headingDegrees = 90): Fix {
  return {
    ...moveCoordinateByMeters(ORIGIN, east, north),
    accuracyMeters,
    headingDegrees,
    speedMetersPerSecond: 1.4,
    timestampMs,
  };
}

function navigation(route = TURN_ROUTE, voiceEnabled = false) {
  return renderHook(({ sample }: { sample: Fix | null }) =>
    useNavigation(route, sample, { voiceEnabled, locale: "ko" }),
  { initialProps: { sample: null as Fix | null } });
}

async function feed(hook: ReturnType<typeof navigation>, sample: Fix) {
  await act(async () => { hook.rerender({ sample }); });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_WALK_TICK_DEBUG", "0");
  vi.stubEnv("NEXT_PUBLIC_WALK_DEBUG", "false");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(SpeechQueue.prototype, "enqueue").mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("회전 미이행 accuracy gate (실제 route engine)", () => {
  it.each([25, 30, null])("신뢰 가능한 accuracy %s에서는 횡거리와 무관하게 passed_turn을 유지하고 말한다", async (accuracy) => {
    const hook = navigation(TURN_ROUTE, true);
    await feed(hook, fix(32, 0, 1_000, accuracy));
    await feed(hook, fix(52, 0, 2_000, accuracy));

    expect(hook.result.current.result?.reasons).toContain("missed_expected_turn");
    if (accuracy !== null) {
      expect(hook.result.current.result?.metrics.distanceFromRouteMeters).toBeLessThan(accuracy);
    }
    expect(hook.result.current.state).toBe("passed_turn");
    expect(hook.result.current.banner).toBe("회전 지점을 지나쳤어요");
    expect(SpeechQueue.prototype.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      eventId: "navigation:state:passed_turn", priority: "deviation",
    }));
  });

  it("저정확도 passed_turn은 여전히 drifting으로 완화하고 경고 음성을 내지 않는다", async () => {
    const hook = navigation(TURN_ROUTE, true);
    await feed(hook, fix(32, 0, 1_000, 40));
    await feed(hook, fix(52, 0, 2_000, 40));

    expect(hook.result.current.result?.reasons).toContain("missed_expected_turn");
    expect(hook.result.current.state).toBe("drifting");
    expect(SpeechQueue.prototype.enqueue).not.toHaveBeenCalledWith(expect.objectContaining({
      eventId: "navigation:state:passed_turn",
    }));
  });

  it("실제 좌회전은 회전 미이행으로 알리지 않는다", async () => {
    const hook = navigation();
    await feed(hook, fix(32, 0, 1_000));
    await feed(hook, fix(40, 12, 2_000, 25, 0));
    expect(hook.result.current.state).toBe("on_route");
  });

  it("deviated의 횡거리/accuracy 비교는 유지한다", async () => {
    const hook = navigation(STRAIGHT_ROUTE);
    for (let i = 0; i < 5; i++) {
      await feed(hook, fix(20 + i * 2, 16, 1_000 + i * 8_000));
    }
    expect(hook.result.current.result?.reasons).toContain("distance_over_deviation_threshold");
    expect(hook.result.current.state).toBe("drifting");
    await feed(hook, fix(32, 16, 41_000, 5));
    expect(hook.result.current.state).toBe("deviated");
  });
});

describe("tick 디버그 로그", () => {
  it.each([undefined, "false", "1"])("플래그 %s에서는 로그를 출력하지 않는다", async (flag) => {
    vi.stubEnv("NEXT_PUBLIC_WALK_DEBUG", flag);
    const hook = navigation();
    await feed(hook, fix(32, 0, 1_000));
    expect(console.info).not.toHaveBeenCalled();
  });

  it.each([
    ["NEXT_PUBLIC_WALK_DEBUG", "true"],
    ["NEXT_PUBLIC_WALK_TICK_DEBUG", "1"],
  ])("%s=%s일 때 raw/보정 상태와 실제 정확도 판단을 기록한다", async (name, value) => {
    // Next 빌드와 동일하게 플래그를 먼저 설정한 다음 모듈을 불러온다.
    vi.stubEnv(name, value);
    vi.resetModules();
    const { useNavigation: useDebugNavigation } = await import("./useNavigation");
    const hook = renderHook(({ sample }: { sample: Fix | null }) =>
      useDebugNavigation(TURN_ROUTE, sample, { voiceEnabled: false, locale: "ko" }),
    { initialProps: { sample: null as Fix | null } });
    await feed(hook, fix(32, 0, 1_000));
    await feed(hook, fix(52, 0, 2_000));
    expect(console.info).toHaveBeenLastCalledWith("[walk:tick]", expect.objectContaining({
      rawState: "passed_turn", state: "passed_turn", accuracyM: 25,
      fixReliable: true, distanceClearsAccuracy: false, confirmedByAccuracy: true,
    }));
  });
});
