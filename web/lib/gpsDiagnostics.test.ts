import { describe, expect, it } from "vitest";
import { moveCoordinateByMeters } from "@walk/route-engine";
import type { Fix } from "./useGeolocation";
import { gpsQuality, initialGpsDiagnostics, updateGpsDiagnostics } from "./gpsDiagnostics";

const ORIGIN = { latitude: 37.5665, longitude: 126.978 };
function sample(east: number, north: number, time: number, accuracy: number | null = 5): Fix {
  return {
    ...moveCoordinateByMeters(ORIGIN, east, north),
    timestampMs: time,
    accuracyMeters: accuracy,
    headingDegrees: null,
    speedMetersPerSecond: null,
  };
}
describe("GPS 품질 진단", () => {
  it("Streamlit과 동일한 15/35m 품질 구간을 사용한다", () => {
    expect([null, -1, 0, 15, 16, 35, 36, 50].map(gpsQuality)).toEqual([
      "unknown", "unknown", "good", "good", "fair", "fair", "weak", "weak",
    ]);
  });

  it("중복·역행 시각의 GPS 표본을 누적하지 않는다", () => {
    const first = updateGpsDiagnostics(initialGpsDiagnostics(), sample(0, 0, 1000));
    expect(updateGpsDiagnostics(first, sample(2, 0, 1000))).toBe(first);
    expect(updateGpsDiagnostics(first, sample(2, 0, 500))).toBe(first);
    expect(first.received).toBe(1);
  });

  it("일반 보행 이동을 GPS 점프로 오판하지 않는다", () => {
    const first = updateGpsDiagnostics(initialGpsDiagnostics(), sample(0, 0, 1000));
    const next = updateGpsDiagnostics(first, sample(5, 0, 5000));
    expect(next.suspectedJumps).toBe(0);
    expect(next.lastAccepted?.timestampMs).toBe(5000);
  });

  it("짧은 시간 120m 순간 점프를 식별하되 수용 위치는 보존한다", () => {
    const first = updateGpsDiagnostics(initialGpsDiagnostics(), sample(0, 0, 1000));
    const jumped = updateGpsDiagnostics(first, sample(120, 0, 2000));
    expect(jumped.lastWasJump).toBe(true);
    expect(jumped.suspectedJumps).toBe(1);
    expect(jumped.received).toBe(2);
    expect(jumped.lastAccepted).toEqual(first.lastAccepted);
  });

  it("3연속 점프 뒤에는 다음 표본을 기준점으로 받아 장시간 고착을 피한다", () => {
    let s = updateGpsDiagnostics(initialGpsDiagnostics(), sample(0, 0, 1000));
    for (const t of [2000, 3000, 4000]) s = updateGpsDiagnostics(s, sample(120, 0, t));
    expect(s.jumpStreak).toBe(3);
    s = updateGpsDiagnostics(s, sample(120, 0, 5000));
    expect(s.jumpStreak).toBe(0);
    expect(s.lastAccepted?.timestampMs).toBe(5000);
  });

  it("60초 경과 시 이전 점프 기준점을 재획득한다", () => {
    const first = updateGpsDiagnostics(initialGpsDiagnostics(), sample(0, 0, 1000));
    const next = updateGpsDiagnostics(first, sample(150, 0, 61_000));
    expect(next.lastWasJump).toBe(false);
    expect(next.lastAccepted?.timestampMs).toBe(61_000);
  });

  it("3개 표본의 좁은 위치 변동은 정지 추정으로 표시한다", () => {
    let s = initialGpsDiagnostics();
    s = updateGpsDiagnostics(s, sample(0, 0, 1000));
    s = updateGpsDiagnostics(s, sample(1, 0, 2000));
    expect(s.stationary).toBe(false);
    s = updateGpsDiagnostics(s, sample(1, 1, 3000));
    expect(s.stationary).toBe(true);
    s = updateGpsDiagnostics(s, sample(7, 0, 7000));
    expect(s.stationary).toBe(false);
  });

  it("정지 추정 직후 진단 점프가 나타나면 오래된 정지 상태를 즉시 해제한다", () => {
    let s = initialGpsDiagnostics();
    s = updateGpsDiagnostics(s, sample(0, 0, 1000, 5));
    s = updateGpsDiagnostics(s, sample(1, 0, 2000, 5));
    s = updateGpsDiagnostics(s, sample(1, 1, 3000, 5));
    expect(s.stationary).toBe(true);
    s = updateGpsDiagnostics(s, sample(120, 0, 4000, 40));
    expect(s.lastWasJump).toBe(true);
    expect(s.stationary).toBe(false);
    expect(s.lastAccepted?.timestampMs).toBe(3000);
    expect(s.lastAccuracyMeters).toBe(40);
    expect(s.received).toBe(4);
    expect(s.suspectedJumps).toBe(1);
  });

  it("위치 정확도가 낮으면 정지라고 확정하지 않는다", () => {
    let s = initialGpsDiagnostics();
    for (const t of [1000, 2000, 3000]) s = updateGpsDiagnostics(s, sample(0, 0, t, 42));
    expect(s.stationary).toBe(false);
  });

  it("좌표가 유효하지 않은 표본은 수용하지 않는다", () => {
    const first = updateGpsDiagnostics(initialGpsDiagnostics(), sample(0, 0, 1000));
    expect(updateGpsDiagnostics(first, { ...sample(0, 0, 2000), latitude: NaN })).toBe(first);
  });
});
