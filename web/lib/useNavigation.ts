"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createRouteDeviationEngine, distanceMeters, getNextTurnPoint, prepareRouteModel } from "@walk/route-engine";
import type { DeviationState, EngineResult, PositionSample } from "@walk/route-engine";
import type { Fix } from "./useGeolocation";
import type { RouteResponse } from "./types";

/** 이 거리(m) 안에 들어오면 도착으로 본다. */
const ARRIVAL_RADIUS_M = 20;
/** 회전을 몇 m 앞에서 예고할지 — 보통 걸음으로 약 9초 전(파이썬판 실측값과 동일). */
const TURN_ANNOUNCE_M = 10;
/** 이보다 정확도가 나쁜 fix 로는 경고를 울리지 않는다(오탐 방지). */
const ALERT_ACCURACY_GATE_M = 30;
/** '벗어나기 시작' 경고 재발화 간격 — 같은 말을 계속 반복하지 않게. */
const DRIFT_REPEAT_COOLDOWN_MS = 20_000;

export interface NavigationSnapshot {
  readonly result: EngineResult | null;
  readonly state: DeviationState;
  readonly arrived: boolean;
  readonly remainingMeters: number | null;
  readonly nextTurn: { id: string; direction: "left" | "right" | "straight"; distanceMeters: number } | null;
  /** 화면 맨 위에 띄울 한 줄 안내. */
  readonly banner: string;
}

const STATE_TEXT: Record<DeviationState, string> = {
  on_route: "경로대로 가고 있어요",
  drifting: "길에서 조금 벗어났어요",
  deviated: "길을 벗어났습니다",
  passed_turn: "회전 지점을 지나쳤어요",
};

function speak(phrase: string, enabled: boolean): void {
  if (!enabled || typeof window === "undefined" || !window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(phrase);
  utter.lang = "ko-KR";
  window.speechSynthesis.cancel();   // 밀린 안내가 쌓여 뒤늦게 나오는 것을 막는다
  window.speechSynthesis.speak(utter);
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
  options: { voiceEnabled: boolean },
): NavigationSnapshot {
  const [result, setResult] = useState<EngineResult | null>(null);
  const [arrived, setArrived] = useState(false);

  const engine = useMemo(
    () => (routeResponse ? createRouteDeviationEngine(routeResponse.route) : null),
    [routeResponse],
  );
  const prepared = useMemo(
    () => (routeResponse ? prepareRouteModel(routeResponse.route) : null),
    [routeResponse],
  );

  const lastFixTs = useRef<number | null>(null);
  const prevSample = useRef<PositionSample | null>(null);
  const spokenState = useRef<DeviationState>("on_route");
  const lastDriftSpokenMs = useRef<number>(0);
  const announcedTurn = useRef<string | null>(null);

  // 경로가 바뀌면 안내 이력을 비운다 — 재탐색 직후 옛 회전을 다시 예고하지 않게.
  useEffect(() => {
    setResult(null);
    setArrived(false);
    prevSample.current = null;
    spokenState.current = "on_route";
    lastDriftSpokenMs.current = 0;
    announcedTurn.current = null;
  }, [routeResponse]);

  useEffect(() => {
    if (!engine || !prepared || !routeResponse || !fix || arrived) return;
    if (lastFixTs.current === fix.timestampMs) return;   // 같은 fix 로 두 번 돌리지 않는다
    lastFixTs.current = fix.timestampMs;

    const previous = prevSample.current;
    // heading·speed 는 기기가 안 줄 때가 많다(정지 중·실내). 직전 표본에서 직접 계산해 채운다.
    let heading = fix.headingDegrees;
    let speed = fix.speedMetersPerSecond;
    if (previous) {
      const dtSec = (fix.timestampMs - previous.timestampMs) / 1000;
      const moved = distanceMeters(previous, fix);
      if (speed === null && dtSec > 0) speed = moved / dtSec;
      if (heading === null && moved >= 1) {
        const dLon = (fix.longitude - previous.longitude) * Math.cos((fix.latitude * Math.PI) / 180);
        heading = ((Math.atan2(dLon, fix.latitude - previous.latitude) * 180) / Math.PI + 360) % 360;
      }
    }

    const sample: PositionSample = {
      latitude: fix.latitude,
      longitude: fix.longitude,
      headingDegrees: heading ?? 0,
      speedMetersPerSecond: speed ?? 0,
      timestampMs: fix.timestampMs,
    };
    prevSample.current = sample;

    const next = engine.processSample(sample);
    setResult(next);

    const dest = routeResponse.route.polyline[routeResponse.route.polyline.length - 1];
    if (dest && distanceMeters(fix, dest) <= ARRIVAL_RADIUS_M) {
      setArrived(true);
      speak("목적지에 도착했습니다.", options.voiceEnabled);
      return;
    }

    // 정확도가 나쁜 fix 로는 말하지 않는다 — GPS 가 튄 것을 이탈로 알리면 신뢰를 잃는다.
    const accurate = fix.accuracyMeters === null || fix.accuracyMeters <= ALERT_ACCURACY_GATE_M;

    if (accurate) {
      const state = next.state;
      if (state === "deviated" || state === "passed_turn") {
        if (spokenState.current !== state) {
          spokenState.current = state;
          speak(STATE_TEXT[state], options.voiceEnabled);
        }
      } else if (state === "drifting") {
        if (fix.timestampMs - lastDriftSpokenMs.current >= DRIFT_REPEAT_COOLDOWN_MS) {
          lastDriftSpokenMs.current = fix.timestampMs;
          spokenState.current = state;
          speak(STATE_TEXT[state], options.voiceEnabled);
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
        announcedTurn.current = turn.turnPoint.id;
        const spoken =
          routeResponse.turnDescriptions[turn.turnPoint.id] ??
          (turn.turnPoint.direction === "left" ? "좌회전입니다" : "우회전입니다");
        speak(spoken, options.voiceEnabled);
      }
    }
  }, [engine, prepared, routeResponse, fix, arrived, options.voiceEnabled]);

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

  const state = result?.state ?? "on_route";
  const banner = arrived ? "목적지에 도착했습니다" : STATE_TEXT[state];

  return { result, state, arrived, remainingMeters, nextTurn, banner };
}
