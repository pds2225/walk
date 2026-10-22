"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bearingDegrees, createRouteDeviationEngine, distanceMeters, findNearestRouteSegment, getExpectedHeadingForSegment, getNextTurnPoint, prepareRouteModel } from "@walk/route-engine";
import type { DeviationState, EngineResult, PositionSample } from "@walk/route-engine";
import { isArrivalAccuracyReliable, isDeviationFixReliable } from "./useGeolocation";
import type { Fix } from "./useGeolocation";
import type { RouteResponse } from "./types";
import { getUiText, speechForEvent, speechForState, speechForTurn, type Locale } from "./i18n";
import { SpeechQueue, type SpeechPriority } from "./voice";

/** 이 거리(m) 안에 들어오면 도착으로 본다. */
const ARRIVAL_RADIUS_M = 20;
/** 회전을 몇 m 앞에서 예고할지 — 보통 걸음으로 약 9초 전(파이썬판 실측값과 동일). */
const TURN_ANNOUNCE_M = 10;
/** '벗어나기 시작' 경고 재발화 간격 — 같은 말을 계속 반복하지 않게. */
const DRIFT_REPEAT_COOLDOWN_MS = 20_000;
const VOICE_RETRY_DELAY_MS = 1_500;
const VOICE_MAX_ATTEMPTS = 2;
/** Tick diagnostics are opt-in. Undefined/0/false keeps production console quiet. */
const WALK_TICK_DEBUG_ENABLED =
  process.env.NEXT_PUBLIC_WALK_TICK_DEBUG === "1" ||
  process.env.NEXT_PUBLIC_WALK_DEBUG === "true";

export interface AccuracyGateDecision {
  readonly result: EngineResult;
  readonly fixReliable: boolean;
  readonly distanceClearsAccuracy: boolean;
}

/**
 * Cross-track distance is only strong deviation evidence when it clears the
 * current GNSS uncertainty radius. Missed-turn detection is different: the
 * route engine already requires passing the turn plus conflicting post-turn
 * movement, so applying distance>=accuracy again can delay a valid passed_turn
 * by tens of metres. The existing 30m fix-quality gate still applies to both.
 */
export function applyDeviationAccuracyGate(
  rawResult: EngineResult,
  accuracyMeters: number | null,
): AccuracyGateDecision {
  const fixReliable = isDeviationFixReliable(accuracyMeters);
  const distance = rawResult.metrics.distanceFromRouteMeters;
  const uncertainty = accuracyMeters ?? 25; // 미보고 위치 정확도는 보수적으로 취급
  const distanceClearsAccuracy =
    accuracyMeters === null || distance >= accuracyMeters;
  // 측위 오차 반경 안의 10~15m 횡거리만으로 경고하지 않는다.
  const driftConfident = distance >= Math.max(12, uncertainty * 0.75);
  const deviationConfident = distance >= Math.max(20, uncertainty + 5);
  const downgradeDeviation =
    rawResult.state === "deviated" &&
    (!fixReliable || !distanceClearsAccuracy || !deviationConfident);
  const downgradePassedTurn =
    rawResult.state === "passed_turn" && !fixReliable;
  const suppressDrift = rawResult.state === "drifting" && !driftConfident;

  const downgradeState =
    (downgradeDeviation || downgradePassedTurn)
      ? (driftConfident ? "drifting" : "on_route")
      : suppressDrift ? "on_route" : null;
  return {
    result: downgradeState
      ? { ...rawResult, state: downgradeState, suggestedNextAction: downgradeState === "on_route" ? "none" : "monitor" }
      : rawResult,
    fixReliable,
    distanceClearsAccuracy,
  };
}

export interface NavigationSnapshot {
  readonly result: EngineResult | null;
  readonly state: DeviationState;
  readonly arrived: boolean;
  readonly remainingMeters: number | null;
  readonly nextTurn: { id: string; direction: "left" | "right" | "straight"; distanceMeters: number } | null;
  readonly sampleCount: number;
  readonly elapsedSinceStartMs: number;
  /** GPS course/trajectory heading used for route-following decisions. */
  readonly movementHeadingDegrees: number | null;
  /** 화면 맨 위에 띄울 한 줄 안내. */
  readonly banner: string;
}

/**
 * 새 GPS fix 가 올 때마다 엔진을 한 번 돌리고, 상태가 바뀔 때만 음성을 낸다.
 *
 * 엔진은 `@walk/route-engine` 그대로다 — 파이썬 `engine.py` 와 golden trace 로 묶여
 * 있어 같은 입력에 같은 판정을 낸다. 여기서는 '언제 말할지'만 정한다.
 */
export function useNavigation(
  routeResponse: RouteResponse | null,
  fix: Fix | null,
  options: { voiceEnabled: boolean; locale: Locale; rerouting?: boolean },
): NavigationSnapshot {
  const [result, setResult] = useState<EngineResult | null>(null);
  const [arrived, setArrived] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [elapsedSinceStartMs, setElapsedSinceStartMs] = useState(0);
  const [movementHeadingDegrees, setMovementHeadingDegrees] = useState<number | null>(null);

  const engine = useMemo(
    () => (routeResponse ? createRouteDeviationEngine(routeResponse.route) : null),
    [routeResponse],
  );
  const prepared = useMemo(
    () => (routeResponse ? prepareRouteModel(routeResponse.route) : null),
    [routeResponse],
  );

  const lastFixTs = useRef<number | null>(null);
  const firstFixTs = useRef<number | null>(null);
  const acceptedSampleCount = useRef(0);
  const headingAnchor = useRef<Fix | null>(null);
  const lastReliableMovementHeading = useRef<number | null>(null);
  const spokenState = useRef<DeviationState>("on_route");
  const lastDriftSpokenMs = useRef<number>(0);
  const announcedTurn = useRef<string | null>(null);
  const speechQueue = useMemo(() => new SpeechQueue(), []);
  const speechCompleted = useRef(new Set<string>());
  const speechPending = useRef(new Set<string>());
  const speechAttempts = useRef(new Map<string, number>());
  const speechRetryTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const speechGeneration = useRef(0);
  const announceRef = useRef<(eventId: string, phrase: string, priority: SpeechPriority) => Promise<boolean>>(
    () => Promise.resolve(false),
  );
  const previousRerouting = useRef(false);
  const hadRoute = useRef(false);

  const announce = useCallback(
    (eventId: string, phrase: string, priority: SpeechPriority): Promise<boolean> => {
      if (!options.voiceEnabled || speechCompleted.current.has(eventId)) return Promise.resolve(false);
      if (speechPending.current.has(eventId)) return Promise.resolve(false);
      const attempts = speechAttempts.current.get(eventId) ?? 0;
      if (attempts >= VOICE_MAX_ATTEMPTS) return Promise.resolve(false);
      speechAttempts.current.set(eventId, attempts + 1);
      speechPending.current.add(eventId);
      const generation = speechGeneration.current;
      return speechQueue.enqueue({ eventId, phrase, locale: options.locale, priority }).then((played) => {
        speechPending.current.delete(eventId);
        if (generation !== speechGeneration.current) return false;
        if (played) {
          speechCompleted.current.add(eventId);
          return true;
        }
        // Mobile autoplay/voice availability can fail transiently. Retry once
        // without marking the navigation event as completed.
        if (attempts + 1 < VOICE_MAX_ATTEMPTS && !speechRetryTimers.current.has(eventId)) {
          const timer = setTimeout(() => {
            speechRetryTimers.current.delete(eventId);
            void announceRef.current(eventId, phrase, priority);
          }, VOICE_RETRY_DELAY_MS);
          speechRetryTimers.current.set(eventId, timer);
        }
        return false;
      });
    },
    [options.locale, options.voiceEnabled, speechQueue],
  );
  announceRef.current = announce;

  const clearSpeech = useCallback(() => {
    speechGeneration.current += 1;
    speechRetryTimers.current.forEach((timer) => clearTimeout(timer));
    speechRetryTimers.current.clear();
    speechCompleted.current.clear();
    speechPending.current.clear();
    speechAttempts.current.clear();
    speechQueue.clear();
  }, [speechQueue]);

  // 경로가 바뀌면 안내 이력을 비운다 — 재탐색 직후 옛 회전을 다시 예고하지 않게.
  useEffect(() => {
    clearSpeech();
    setResult(null);
    setArrived(false);
    setSampleCount(0);
    setElapsedSinceStartMs(0);
    setMovementHeadingDegrees(null);
    lastFixTs.current = null;
    firstFixTs.current = null;
    acceptedSampleCount.current = 0;
    headingAnchor.current = null;
    lastReliableMovementHeading.current = null;
    spokenState.current = "on_route";
    lastDriftSpokenMs.current = 0;
    announcedTurn.current = null;
    previousRerouting.current = options.rerouting ?? false;
  }, [clearSpeech, routeResponse]);

  useEffect(() => {
    if (!options.voiceEnabled) clearSpeech();
  }, [clearSpeech, options.voiceEnabled]);

  useEffect(() => {
    if (routeResponse && !hadRoute.current) {
      void announce("navigation:start", speechForEvent(options.locale, "start"), "normal");
    }
    hadRoute.current = routeResponse !== null;
  }, [announce, options.locale, routeResponse]);

  useEffect(() => {
    const rerouting = options.rerouting ?? false;
    if (rerouting && !previousRerouting.current) {
      void announce("navigation:rerouting", speechForEvent(options.locale, "rerouting"), "reroute");
    } else if (!rerouting && previousRerouting.current && routeResponse) {
      void announce("navigation:route-updated", speechForEvent(options.locale, "updated"), "normal");
    }
    previousRerouting.current = rerouting;
  }, [announce, options.locale, options.rerouting, routeResponse]);

  useEffect(() => {
    if (!engine || !prepared || !routeResponse || !fix || arrived) return;
    if (lastFixTs.current !== null && fix.timestampMs <= lastFixTs.current) return;   // stale/same fix 무시
    lastFixTs.current = fix.timestampMs;

    if (firstFixTs.current === null) firstFixTs.current = fix.timestampMs;
    acceptedSampleCount.current += 1;
    setSampleCount(acceptedSampleCount.current);
    setElapsedSinceStartMs(Math.max(0, fix.timestampMs - (firstFixTs.current ?? fix.timestampMs)));

    // 정지 상태에서 1m GPS 지터로 계산한 course/speed는 방향 오표시와 이탈 오탐을 만든다.
    // 기기 course는 실제 보행속도일 때만 신뢰하며, 없으면 여러 위치 사이의 유효 변위로 구한다.
    let speed = fix.speedMetersPerSecond !== null && Number.isFinite(fix.speedMetersPerSecond)
      ? Math.max(0, fix.speedMetersPerSecond) : null;
    let heading = speed !== null && speed >= 0.7 ? fix.headingDegrees : null;
    const anchor = headingAnchor.current;
    if (!anchor) {
      headingAnchor.current = fix;
    } else {
      const dtSec = (fix.timestampMs - anchor.timestampMs) / 1000;
      const moved = distanceMeters(anchor, fix);
      const minMovementMeters = Math.max(8, Math.min(15, (fix.accuracyMeters ?? 20) * 0.5));
      if (dtSec > 0 && moved >= minMovementMeters) {
        const derivedSpeed = moved / dtSec;
        // 비정상적인 GPS 순간 점프는 방향 근거가 아니다. 다음 표본부터 재측정한다.
        if (derivedSpeed >= 0.7 && derivedSpeed <= 3.5) {
          if (speed === null) speed = derivedSpeed;
          if (heading === null) heading = bearingDegrees(anchor, fix);
        }
        headingAnchor.current = fix;
      }
    }
    if (heading !== null) lastReliableMovementHeading.current = heading;
    setMovementHeadingDegrees(lastReliableMovementHeading.current);
    // 알 수 없는 heading을 북쪽(0°)으로 만들어 회전 미이행을 확정하지 않는다.
    // 신뢰 가능한 이동 방향이 없으면 경로 접선 방향을 채우되 speed=0으로 방향 충돌을 막는다.
    const segment = findNearestRouteSegment(prepared, fix);
    const fallbackHeading = getExpectedHeadingForSegment(prepared, segment.segmentIndex);
    const hasMotionEvidence = heading !== null;
    const sample: PositionSample = {
      latitude: fix.latitude,
      longitude: fix.longitude,
      headingDegrees: heading ?? lastReliableMovementHeading.current ?? fallbackHeading,
      speedMetersPerSecond: hasMotionEvidence ? (speed ?? 0) : 0,
      timestampMs: fix.timestampMs,
    };

    const rawResult = engine.processSample(sample);

    const accuracyGate = applyDeviationAccuracyGate(rawResult, fix.accuracyMeters);
    const accurate = accuracyGate.fixReliable;
    const distanceClearsAccuracy = accuracyGate.distanceClearsAccuracy;
    const next = accuracyGate.result;
    setResult(next);

    const dest = routeResponse.route.polyline[routeResponse.route.polyline.length - 1];
    if (
      dest &&
      distanceMeters(fix, dest) <= ARRIVAL_RADIUS_M &&
      isArrivalAccuracyReliable(fix.accuracyMeters)
    ) {
      setArrived(true);
      void announce("navigation:arrived", speechForEvent(options.locale, "arrived"), "arrival");
      return;
    }

    // Opt-in field diagnostics. Production/default builds do not emit one log per GPS tick.
    if (WALK_TICK_DEBUG_ENABLED) {
      const cfg = engine.getConfig();
      console.info("[walk:tick]", {
        t: fix.timestampMs,
        rawState: rawResult.state,
        state: next.state,
        score: next.score,
        reasons: next.reasons,
        distFromRouteM: next.metrics.distanceFromRouteMeters,
        headingDiffDeg: next.metrics.headingDifferenceDegrees,
        speedMps: sample.speedMetersPerSecond,
        accuracyM: fix.accuracyMeters,
        fixReliable: accurate,
        distanceClearsAccuracy,
        confirmedByAccuracy: accurate && (rawResult.state === "passed_turn" || distanceClearsAccuracy),
        consecutiveBreaches: next.metrics.consecutiveThresholdBreaches,
        driftDurationMs: next.metrics.driftDurationMs,
        thresholds: {
          driftM: cfg.routeDriftDistanceThresholdMeters,
          deviationM: cfg.routeDeviationDistanceThresholdMeters,
          strongM: cfg.strongDeviationDistanceThresholdMeters,
          headingDeg: cfg.headingDifferenceThresholdDegrees,
        },
      });
    }

    if (accurate) {
      const state = next.state;
      if (state === "deviated" || state === "passed_turn") {
        if (spokenState.current !== state) {
          void announce(`navigation:state:${state}`, speechForState(options.locale, state), "deviation").then((played) => {
            if (played) spokenState.current = state;
          });
        }
      } else if (state === "drifting") {
        if (fix.timestampMs - lastDriftSpokenMs.current >= DRIFT_REPEAT_COOLDOWN_MS) {
          void announce(`navigation:state:${state}:${fix.timestampMs}`, speechForState(options.locale, state), "drift").then((played) => {
            if (played) {
              lastDriftSpokenMs.current = fix.timestampMs;
              spokenState.current = state;
            }
          });
        }
      } else {
        spokenState.current = "on_route";
      }

      const turn = getNextTurnPoint(prepared, next.metrics.routeDistanceAlongMeters);
      if (
        turn &&
        turn.turnPoint.direction !== "straight" &&
        turn.distanceToTurnPointMeters <= TURN_ANNOUNCE_M &&
        announcedTurn.current !== turn.turnPoint.id
      ) {
        const turnId = turn.turnPoint.id;
        const spoken = speechForTurn(options.locale, turn.turnPoint.direction, routeResponse.turnDescriptions[turnId]);
        void announce(`navigation:turn:${turnId}`, spoken, "normal").then((played) => {
          if (played) announcedTurn.current = turnId;
        });
      }
    }
  }, [announce, engine, prepared, routeResponse, fix, arrived, options.locale]);

  const nextTurn = useMemo(() => {
    if (!prepared || !result) return null;
    const turn = getNextTurnPoint(prepared, result.metrics.routeDistanceAlongMeters);
    if (!turn) return null;
    return {
      id: turn.turnPoint.id,
      direction: turn.turnPoint.direction,
      distanceMeters: Math.round(turn.distanceToTurnPointMeters),
    };
  }, [prepared, result]);

  const remainingMeters = useMemo(() => {
    if (!prepared || !result) return null;
    const cumulative = prepared.cumulativeDistancesMeters;
    const total = cumulative[cumulative.length - 1] ?? 0;
    return Math.max(0, Math.round(total - result.metrics.routeDistanceAlongMeters));
  }, [prepared, result]);

  // 정확도 보정(위 tick 이펙트)이 이미 result.state 에 반영돼 있어 여기서 다시 완화할 필요는 없다.
  const state = result?.state ?? "on_route";
  const ui = getUiText(options.locale);
  const banner = arrived ? ui.arrived : ui.state(state);

  return {
    result,
    state,
    arrived,
    remainingMeters,
    nextTurn,
    banner,
    sampleCount,
    elapsedSinceStartMs,
    movementHeadingDegrees,
  };
}
