"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Coordinate } from "./types";

export interface Fix extends Coordinate {
  readonly accuracyMeters: number | null;
  readonly headingDegrees: number | null;
  readonly speedMetersPerSecond: number | null;
  readonly timestampMs: number;
}

export interface GeolocationState {
  readonly fix: Fix | null;
  readonly error: string | null;
  /** 아직 첫 위치를 못 받은 동안 true — 버튼을 막지 않고 안내만 띄우는 데 쓴다. */
  readonly waiting: boolean;
}

/**
 * watchPosition 을 그대로 구독한다.
 *
 * Streamlit 판(1초 폴링 + 전체 rerun)과 가장 크게 다른 지점이다. 브라우저가 새 fix 를
 * 밀어줄 때만 상태가 바뀌고, 바뀐 부분만 다시 그린다 — 폴링도, 화면 재생성도 없다.
 * `enabled` 가 false 면 워처를 아예 붙이지 않아 목적지 입력 중 배터리를 쓰지 않는다.
 */
/**
 * 실외를 걸을 때는 신호가 잠깐씩 끊기며 watchPosition 의 오류 콜백이 튄다 — 성공
 * 콜백 사이사이에 섞여 온다. 튈 때마다 바로 에러 문구를 띄우면(그리고 바로 다음
 * fix 에서 지우면) 화면이 계속 깜빡인다. 이만큼(ms) 이어질 때만 진짜 문제로 본다.
 */
const GEO_ERROR_GRACE_MS = 3_000;

export function useGeolocation(enabled: boolean): GeolocationState {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setWaiting(false);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("이 브라우저는 위치 기능을 지원하지 않습니다.");
      return;
    }

    setWaiting(true);
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
        setWaiting(false);
        setError(null);
        setFix({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          headingDegrees: Number.isFinite(pos.coords.heading ?? NaN) ? pos.coords.heading : null,
          speedMetersPerSecond: Number.isFinite(pos.coords.speed ?? NaN) ? pos.coords.speed : null,
          timestampMs: pos.timestamp,
        });
      },
      (err) => {
        setWaiting(false);
        clearErrorTimer();
        errorTimer = setTimeout(() => {
          setError(
            err.code === err.PERMISSION_DENIED
              ? "위치 권한이 꺼져 있습니다. 브라우저 설정에서 허용해 주세요."
              : "현재 위치를 찾지 못했습니다. 실내라면 창가로 나가 보세요.",
          );
        }, GEO_ERROR_GRACE_MS);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
    return () => {
      clearErrorTimer();
      navigator.geolocation.clearWatch(id);
    };
  }, [enabled]);

  return { fix, error, waiting };
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
