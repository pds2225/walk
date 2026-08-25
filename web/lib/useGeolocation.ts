"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Coordinate } from "./types";

export interface Fix extends Coordinate {
  readonly accuracyMeters: number | null;
  readonly headingDegrees: number | null;
  readonly speedMetersPerSecond: number | null;
  readonly timestampMs: number;
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
      (pos) => resolve(toFix(pos)),
      (err) => reject(new Error(geoErrorMessage(err))),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  });
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

  useEffect(() => {
    if (!enabled) {
      setError(null);
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
        setError(null);
        setFix(toFix(pos));
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

/**
 * 나침반(기기 방위) — 서 있을 때 '보는 방향'. GPS heading 은 걸어야만 값이 나온다.
 *
 * iOS 는 사용자 제스처 안에서 requestPermission() 을 불러야 해서 `request` 를 노출한다.
 * 안드로이드는 절대방위(deviceorientationabsolute)를 우선하되, 그게 안 오면 일반
 * deviceorientation 으로 떨어진다 — 파이썬판 진단에서 확인한 순서 그대로다.
 */
export function useCompass(enabled: boolean): { headingDegrees: number | null; request: () => void } {
  const [headingDegrees, setHeading] = useState<number | null>(null);
  const absoluteSeen = useRef(false);

  const handle = useCallback((event: DeviceOrientationEvent, absolute: boolean) => {
    if (absolute) absoluteSeen.current = true;
    // 절대방위가 한 번이라도 왔으면 일반 이벤트는 무시한다(진북 기준이 아니라 방향이 틀어진다).
    if (!absolute && absoluteSeen.current) return;

    const webkit = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
      .webkitCompassHeading;
    if (typeof webkit === "number" && Number.isFinite(webkit)) {
      setHeading(((webkit % 360) + 360) % 360);
      return;
    }
    if (typeof event.alpha === "number" && Number.isFinite(event.alpha)) {
      setHeading(((360 - event.alpha) % 360 + 360) % 360);
    }
  }, []);

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
