"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { distanceMeters } from "@walk/route-engine";
import type { Coordinate } from "./types";

export interface Fix extends Coordinate {
  readonly accuracyMeters: number | null;
  readonly headingDegrees: number | null;
  readonly speedMetersPerSecond: number | null;
  readonly timestampMs: number;
}

// Streamlit 판과 동일한 위치 품질 경계. 50m 초과 fix는 현재 위치·엔진
// 입력으로 쓰지 않고, 35m 초과 fix는 도착을 확정하지 않는다.
export const USABLE_ACCURACY_M = 50;
export const ARRIVAL_ACCURACY_M = 35;
// 기존 navigation 경고/재탐색 gate. 이보다 나쁜 fix는 위치는 보관하되
// hard deviation이나 reroute의 근거로 사용하지 않는다.
export const DEVIATION_ACCURACY_M = 30;

export function isFixUsable(accuracyMeters: number | null): boolean {
  return accuracyMeters === null || accuracyMeters <= USABLE_ACCURACY_M;
}

export function isArrivalAccuracyReliable(accuracyMeters: number | null): boolean {
  return accuracyMeters === null || accuracyMeters <= ARRIVAL_ACCURACY_M;
}

export function isDeviationFixReliable(accuracyMeters: number | null): boolean {
  return accuracyMeters === null || accuracyMeters <= DEVIATION_ACCURACY_M;
}

function toFix(pos: GeolocationPosition): Fix {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracyMeters: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
    headingDegrees: Number.isFinite(pos.coords.heading ?? NaN) ? pos.coords.heading : null,
    speedMetersPerSecond: Number.isFinite(pos.coords.speed ?? NaN) ? pos.coords.speed : null,
    timestampMs: pos.timestamp,
  };
}

function geoErrorMessage(err: GeolocationPositionError): string {
  return err.code === err.PERMISSION_DENIED
    ? "위치 권한이 꺼져 있습니다. 브라우저 설정에서 허용해 주세요."
    : "현재 위치를 찾지 못했습니다. 실내라면 창가로 나가 보세요.";
}

/**
 * '걷기'를 누른 그 순간에만 위치를 한 번 읽는다 — watchPosition 을 붙이지 않는다.
 * 목적지를 고르는 동안에는 이 함수가 절대 호출되지 않는다: 호출부는 오직
 * page.tsx 의 startWalking() 뿐이다. 실패해도 재시도하지 않는다 — 버튼을 다시
 * 누르는 것 자체가 재시도다.
 */
export function getCurrentPositionOnce(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("이 브라우저는 위치 기능을 지원하지 않습니다."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fix = toFix(pos);
        if (!isFixUsable(fix.accuracyMeters)) {
          reject(new Error("현재 위치의 정확도가 낮습니다. 잠시 후 다시 시도해 주세요."));
          return;
        }
        resolve(fix);
      },
      (err) => reject(new Error(geoErrorMessage(err))),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  });
}

/**
 * 검색 기준 좌표용 단발 위치 조회. 검색은 '가까운 순' 편향만 필요하므로 저정확도·최근 캐시를
 * 허용하고 정확도 필터를 두지 않는다(실내 수백 m 오차도 시청 기본값보다 훨씬 낫다).
 * 단발 getCurrentPosition 이다 — 연속 추적(watchPosition)은 안내 중에만 쓴다.
 */
export const SEARCH_CENTER_GOOD_ACCURACY_M = 100;
export const SEARCH_CENTER_MAX_ACCURACY_M = 2_000;
export const SEARCH_ORIGIN_MAX_AGE_MS = 120_000;

/** 검색 편향에 쓸 수 있는 fix 인가 — 오래됐거나(2분) 정확도가 너무 나쁘면(2km) 쓰지 않는다. */
export function isSearchCenterFresh(fix: Fix | null, nowMs: number = Date.now()): fix is Fix {
  if (!fix) return false;
  if (nowMs - fix.timestampMs > SEARCH_ORIGIN_MAX_AGE_MS) return false;
  return fix.accuracyMeters === null || fix.accuracyMeters <= SEARCH_CENTER_MAX_ACCURACY_M;
}

function readOnce(options: PositionOptions): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("이 브라우저는 위치 기능을 지원하지 않습니다."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toFix(pos)),
      (err) => reject(new Error(geoErrorMessage(err))),
      options,
    );
  });
}

function betterFix(a: Fix | null, b: Fix | null): Fix | null {
  if (!a) return b;
  if (!b) return a;
  return (b.accuracyMeters ?? Infinity) < (a.accuracyMeters ?? Infinity) ? b : a;
}

/**
 * 검색 기준 좌표용 단발 위치 조회(watchPosition 아님 — 연속 추적은 안내 중에만).
 * 1) 빠른 저정확도(30초 캐시 허용) → 2) 정확도가 100m 보다 나쁘거나 실패하면 고정밀 1회 재시도
 * → 더 정확한 쪽 사용. 2km 보다 나쁜 fix 는 '가까운 순' 근거로 쓰지 않는다(실패 취급).
 * onUpdate 로 1차 결과를 먼저 넘겨 검색이 기다리지 않게 한다.
 */
export async function getSearchCenterOnce(onUpdate?: (fix: Fix) => void): Promise<Fix> {
  let best: Fix | null = null;
  try {
    const quick = await readOnce({ enableHighAccuracy: false, maximumAge: 30_000, timeout: 6_000 });
    if (isSearchCenterFresh(quick)) best = quick;
  } catch (err) {
    if (err instanceof Error && err.message.includes("권한")) throw err;
  }
  if (best && best.accuracyMeters !== null && best.accuracyMeters <= SEARCH_CENTER_GOOD_ACCURACY_M) return best;
  if (best && onUpdate) onUpdate(best);
  try {
    const precise = await readOnce({ enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 });
    if (isSearchCenterFresh(precise)) best = betterFix(best, precise);
  } catch {
    /* 1차 결과가 있으면 그걸 쓴다. */
  }
  if (!best) throw new Error("현재 위치를 찾지 못했습니다. 실내라면 창가로 나가 보세요.");
  return best;
}

export interface WatchPositionState {
  readonly fix: Fix | null;
  readonly error: string | null;
}

/**
 * 실외를 걸을 때는 신호가 잠깐씩 끊기며 watchPosition 의 오류 콜백이 튄다 — 성공
 * 콜백 사이사이에 섞여 온다. 튈 때마다 바로 에러 문구를 띄우면(그리고 바로 다음
 * fix 에서 지우면) 화면이 계속 깜빡인다. 이만큼(ms) 이어질 때만 진짜 문제로 본다.
 * getCurrentPositionOnce 는 사용자가 직접 누른 단발 시도라 이 유예가 필요 없다
 * (실패하면 바로 보여주고, 재시도는 재클릭으로 한다).
 */
const GEO_ERROR_GRACE_MS = 3_000;

/**
 * enabled 인 동안만 watchPosition 을 구독한다 — navigating/arrived 화면에서만
 * 켜진다(page.tsx). 목적지를 고르는 것만으로는 절대 켜지지 않는다: 그게 이전에
 * 화면이 계속 깜빡이던 근본 원인이었다(목적지 선택 → GPS 구독 시작 → fix 갱신마다
 * 리렌더). enabled 가 꺼지면 지난 오류 문구도 같이 지운다 — 안 지우면 이전
 * 내비게이션에서 뜬 GPS 오류가 다음 화면까지 남아있는다.
 */
export function useWatchPosition(enabled: boolean): WatchPositionState {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastObservedTimestamp = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setFix(null);
      setError(null);
      lastObservedTimestamp.current = null;
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("이 브라우저는 위치 기능을 지원하지 않습니다.");
      return;
    }

    let errorTimer: ReturnType<typeof setTimeout> | null = null;
    const clearErrorTimer = () => {
      if (errorTimer !== null) {
        clearTimeout(errorTimer);
        errorTimer = null;
      }
    };
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        clearErrorTimer();
        const nextFix = toFix(pos);
        if (lastObservedTimestamp.current !== null && nextFix.timestampMs <= lastObservedTimestamp.current) return;
        lastObservedTimestamp.current = nextFix.timestampMs;
        if (!isFixUsable(nextFix.accuracyMeters)) {
          setError("위치 신호가 약해 현재 위치를 잠시 유지합니다.");
          return;
        }
        setError(null);
        setFix(nextFix);
      },
      (err) => {
        clearErrorTimer();
        errorTimer = setTimeout(() => setError(geoErrorMessage(err)), GEO_ERROR_GRACE_MS);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
    return () => {
      clearErrorTimer();
      navigator.geolocation.clearWatch(id);
    };
  }, [enabled]);

  return { fix, error };
}

// 전통시장 골목처럼 지붕·간판·건물에 위성신호가 반사되는 곳에서는 accuracy 가
// 괜찮아도(≤50m) 연속된 fix 사이에서 좌표가 몇 m씩 튄다. 이걸 하드웨어 이상으로
// 없앨 수는 없지만(SBAS/KASS 급 보정은 범위 밖), 화면에 표시하는 좌표만 이전
// 위치와 accuracy 가중 평균으로 부드럽게 만들면 튐이 줄어든다. 판정용 fix(useNavigation
// 입력)는 절대 이걸 거치지 않는다 — 스무딩이 이탈/도착 판정에 섞이면 판정이 스무딩
// 지연(수 초)만큼 늦어진다(Streamlit 데모 gps_filter.accuracy_weighted_blend와 동일
// 원리·동일 이유의 이원화).
const SMOOTH_SKIP_MOVE_M = 8; // 이탈 drift 임계(10m)보다 작게 유지 — 실제 이동을 지연시키지 않는다.

function blendPositionByAccuracy(
  prevLatitude: number,
  prevLongitude: number,
  prevAccuracyMeters: number | null,
  nextLatitude: number,
  nextLongitude: number,
  nextAccuracyMeters: number | null,
): { latitude: number; longitude: number } {
  if (prevAccuracyMeters === null || nextAccuracyMeters === null) {
    return { latitude: nextLatitude, longitude: nextLongitude };
  }
  const total = prevAccuracyMeters + nextAccuracyMeters;
  if (total <= 0) {
    return { latitude: nextLatitude, longitude: nextLongitude };
  }
  // 정확도가 더 나쁜(숫자가 큰) 쪽일수록 그 fix의 가중치는 작아진다.
  const nextWeight = prevAccuracyMeters / total;
  const prevWeight = 1 - nextWeight;
  return {
    latitude: prevLatitude * prevWeight + nextLatitude * nextWeight,
    longitude: prevLongitude * prevWeight + nextLongitude * nextWeight,
  };
}

/**
 * 지도에 표시할 '현재 위치' 좌표만 부드럽게 만든다 — 판정용 fix는 그대로 둔다.
 * 8m 이상 한 번에 움직였다면 실제 이동이거나 신호 재획득 직후의 큰 보정으로 보고
 * 스무딩 없이 그대로 반영한다(그렇지 않으면 화면 핀이 실제 이동을 뒤늦게 따라간다).
 */
export function useSmoothedFix(fix: Fix | null): Fix | null {
  const [smoothed, setSmoothed] = useState<Fix | null>(null);
  const prevRef = useRef<{ latitude: number; longitude: number; accuracyMeters: number | null } | null>(null);
  const lastTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    if (!fix) {
      prevRef.current = null;
      lastTimestampRef.current = null;
      setSmoothed(null);
      return;
    }
    if (lastTimestampRef.current === fix.timestampMs) return; // 같은 fix 재처리 방지
    lastTimestampRef.current = fix.timestampMs;

    const prev = prevRef.current;
    let latitude = fix.latitude;
    let longitude = fix.longitude;
    if (prev && distanceMeters(prev, fix) < SMOOTH_SKIP_MOVE_M) {
      const blended = blendPositionByAccuracy(
        prev.latitude, prev.longitude, prev.accuracyMeters,
        fix.latitude, fix.longitude, fix.accuracyMeters,
      );
      latitude = blended.latitude;
      longitude = blended.longitude;
    }
    prevRef.current = { latitude, longitude, accuracyMeters: fix.accuracyMeters };
    setSmoothed({ ...fix, latitude, longitude });
  }, [fix]);

  return smoothed;
}

/**
 * 나침반(기기 방위) — 서 있을 때 '보는 방향'. GPS heading 은 걸어야만 값이 나온다.
 *
 * iOS 는 사용자 제스처 안에서 requestPermission() 을 불러야 해서 `request` 를 노출한다.
 * 안드로이드는 절대방위(deviceorientationabsolute 또는 absolute=true)만 사용한다.
 * 상대방위 alpha는 진북 기준이 아니므로 지도 방향으로 사용하지 않는다.
 */
export function useCompass(enabled: boolean): { headingDegrees: number | null; request: () => void } {
  const [headingDegrees, setHeading] = useState<number | null>(null);
  const handle = useCallback((event: DeviceOrientationEvent, absolute: boolean) => {
    const webkitEvent = event as DeviceOrientationEvent & {
      webkitCompassHeading?: number;
      webkitCompassAccuracy?: number;
    };
    // iOS는 나침반 오차각을 제공할 수 있다. 매우 불확실한 측정치는 화면을 돌리지 않는다.
    if (typeof webkitEvent.webkitCompassAccuracy === "number" &&
        webkitEvent.webkitCompassAccuracy > 35) return;

    const webkit = webkitEvent.webkitCompassHeading;
    let next: number | null = null;
    // iOS 는 보정 전 webkitCompassHeading 을 -1 로 준다 — 방위로 쓰지 않는다.
    if (typeof webkit === "number" && Number.isFinite(webkit) && webkit >= 0) {
      next = ((webkit % 360) + 360) % 360;
    } else if ((absolute || event.absolute === true) &&
               typeof event.alpha === "number" && Number.isFinite(event.alpha)) {
      // 상대 deviceorientation(alpha)은 진북 기준이 아니므로 방위로 표시하지 않는다.
      next = ((360 - event.alpha) % 360 + 360) % 360;
    }
    if (next === null) return;
    // 359°→1° 등 북쪽 경계에서도 최단 각도로 완만하게 회전한다.
    const measured = next;
    setHeading((previous) => {
      if (previous === null) return measured;
      const delta = ((measured - previous + 540) % 360) - 180;
      return Math.abs(delta) < 2 ? previous : ((previous + delta * 0.35) % 360 + 360) % 360;
    });
  }, []);

  useEffect(() => {
    // 이전 길안내의 방위는 구독을 재시작했을 때의 현재 방위가 아니다.
    if (!enabled) setHeading(null);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onAbsolute = (e: Event) => handle(e as DeviceOrientationEvent, true);
    const onPlain = (e: Event) => handle(e as DeviceOrientationEvent, false);
    window.addEventListener("deviceorientationabsolute", onAbsolute, true);
    window.addEventListener("deviceorientation", onPlain, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onAbsolute, true);
      window.removeEventListener("deviceorientation", onPlain, true);
    };
  }, [enabled, handle]);

  const request = useCallback(() => {
    const ctor = (window as unknown as {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
    }).DeviceOrientationEvent;
    void ctor?.requestPermission?.().catch(() => undefined);
  }, []);

  return { headingDegrees, request };
}
