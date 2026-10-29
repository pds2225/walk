import { distanceMeters } from "@walk/route-engine";
import type { Fix } from "./useGeolocation";

/**
 * 안내 화면에서만 사용되는 비영속 GPS 관찰 상태.
 * 추적 위치는 컴포넌트 메모리 밖으로 내보내지 않고 길안내 입력·재탐색을 바꾸지 않는다.
 * 값은 Streamlit gps_filter.py의 GOOD/FAIR 구간과 보행 점프 허용 공식을 참고한다.
 */
export type GpsQuality = "good" | "fair" | "weak" | "unknown";

export function gpsQuality(accuracy: number | null): GpsQuality {
  if (accuracy === null || !Number.isFinite(accuracy) || accuracy < 0) return "unknown";
  if (accuracy <= 15) return "good";
  if (accuracy <= 35) return "fair";
  return "weak";
}

export interface GpsDiagnostics {
  readonly lastAccepted: Fix | null;
  readonly lastSeenTimestampMs: number | null;
  readonly lastAccuracyMeters: number | null;
  readonly received: number;
  readonly suspectedJumps: number;
  readonly jumpStreak: number;
  readonly lastWasJump: boolean;
  readonly recentAccepted: readonly Fix[];
  /** 최소 3개 최근 표본이 좁은 범위에 모였을 때만 '정지 추정'으로 판단. */
  readonly stationary: boolean;
}

export function initialGpsDiagnostics(): GpsDiagnostics {
  return {
    lastAccepted: null,
    lastSeenTimestampMs: null,
    lastAccuracyMeters: null,
    received: 0,
    suspectedJumps: 0,
    jumpStreak: 0,
    lastWasJump: false,
    recentAccepted: [],
    stationary: false,
  };
}

/**
 * 관찰용 점프 탐지: max(경과초, 1) * 3m/s + 두 위치의 정확도 반경 + 10m.
 * 단발 GPS 점프는 진단에서만 기록하고 실제 nav engine의 fix는 교체하지 않는다.
 * 3연속 의심값 또는 60초 경과 시 최신 fix를 다시 기준점으로 수용해 고착을 피한다.
 */
export function updateGpsDiagnostics(state: GpsDiagnostics, fix: Fix): GpsDiagnostics {
  if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude) ||
      !Number.isFinite(fix.timestampMs) || Math.abs(fix.latitude) > 90 ||
      Math.abs(fix.longitude) > 180) return state;
  if (state.lastSeenTimestampMs !== null && fix.timestampMs <= state.lastSeenTimestampMs) return state;

  const previous = state.lastAccepted;
  const elapsed = previous ? fix.timestampMs - previous.timestampMs : 0;
  const moved = previous ? distanceMeters(previous, fix) : 0;
  const allowed = previous
    ? 3 * Math.max(elapsed / 1000, 1) +
      Math.max(0, fix.accuracyMeters ?? 0) +
      Math.max(0, previous.accuracyMeters ?? 0) + 10
    : 0;
  const jump = previous !== null && moved > allowed &&
    state.jumpStreak < 3 && elapsed < 60_000;

  if (jump) {
    return {
      ...state,
      lastSeenTimestampMs: fix.timestampMs,
      lastAccuracyMeters: fix.accuracyMeters,
      received: state.received + 1,
      suspectedJumps: state.suspectedJumps + 1,
      jumpStreak: state.jumpStreak + 1,
      lastWasJump: true,
      // 의심 점프를 발견한 순간에는 직전의 정지 추정을 유지하지 않는다.
      stationary: false,
    };
  }

  const recent = [...state.recentAccepted, fix].slice(-5);
  // '정지'는 추정 표시만 한다. 정확도가 나쁘면 위치 지터와 실제 정지를 구분할 수 없다.
  const stationary = recent.length >= 3 && gpsQuality(fix.accuracyMeters) !== "weak" &&
    gpsQuality(fix.accuracyMeters) !== "unknown" &&
    recent.every((point) => distanceMeters(recent[0]!, point) <= 2.5);
  return {
    lastAccepted: fix,
    lastSeenTimestampMs: fix.timestampMs,
    lastAccuracyMeters: fix.accuracyMeters,
    received: state.received + 1,
    suspectedJumps: state.suspectedJumps,
    jumpStreak: 0,
    lastWasJump: false,
    recentAccepted: recent,
    stationary,
  };
}
