"use client";

import { useEffect, useState } from "react";
import type { Locale } from "../lib/i18n";

export type WalkTimePhase = "preview" | "navigating" | "arrived";

interface WalkTimeReadoutProps {
  readonly locale: Locale;
  readonly phase: WalkTimePhase;
  readonly totalSeconds: number | null;
  readonly totalDistanceMeters: number | null;
  readonly remainingMeters?: number | null;
}

/** Missing/invalid provider time must not become a fabricated ETA. */
export function validRouteSeconds(seconds: number | null | undefined): number | null {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0
    ? seconds
    : null;
}

/** Uses the active route (not the original route) after a reroute. */
export function remainingRouteSeconds(
  totalSeconds: number | null | undefined,
  totalMeters: number | null | undefined,
  remainingMeters: number | null | undefined,
): number | null {
  const seconds = validRouteSeconds(totalSeconds);
  if (seconds === null ||
      typeof totalMeters !== "number" || !Number.isFinite(totalMeters) || totalMeters <= 0 ||
      typeof remainingMeters !== "number" || !Number.isFinite(remainingMeters) || remainingMeters < 0) {
    return null;
  }
  return Math.round(seconds * Math.min(remainingMeters, totalMeters) / totalMeters);
}

export function elapsedClock(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hh = Math.floor(safe / 3600);
  const mm = Math.floor((safe % 3600) / 60);
  const ss = safe % 60;
  return hh > 0
    ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${mm}:${String(ss).padStart(2, "0")}`;
}

const COPY: Record<Locale, {
  readonly times: string;
  readonly estimated: string;
  readonly remaining: string;
  readonly elapsed: string;
  readonly actual: string;
  readonly sinceArrival: string;
  readonly unknown: string;
  readonly locating: string;
  readonly lessThanMinute: string;
  readonly approximately: (minutes: number) => string;
}> = {
  ko: {
    times: "이동시간 안내", estimated: "예상 이동", remaining: "남은 예상",
    elapsed: "이동 경과", actual: "실제 이동", sinceArrival: "도착 후 경과(체류 참고)",
    unknown: "확인 불가", locating: "위치 확인 중", lessThanMinute: "1분 미만", approximately: (minutes) => `약 ${minutes}분`,
  },
  en: {
    times: "Walking times", estimated: "Estimated walk", remaining: "Estimated remaining",
    elapsed: "Walking elapsed", actual: "Actual walk", sinceArrival: "Since arrival (not verified dwell)",
    unknown: "unavailable", locating: "Waiting for location", lessThanMinute: "under 1 min", approximately: (minutes) => `about ${minutes} min`,
  },
  ja: {
    times: "歩行時間", estimated: "予想歩行時間", remaining: "残り予想",
    elapsed: "歩行経過", actual: "実際の歩行", sinceArrival: "到着後経過（滞在の参考）",
    unknown: "確認不可", locating: "位置確認中", lessThanMinute: "1分未満", approximately: (minutes) => `約${minutes}分`,
  },
  zh: {
    times: "步行时间", estimated: "预计步行", remaining: "预计剩余",
    elapsed: "步行已用", actual: "实际步行", sinceArrival: "到达后经过（仅供停留参考）",
    unknown: "无法确认", locating: "正在确认位置", lessThanMinute: "不足1分钟", approximately: (minutes) => `约${minutes}分钟`,
  },
};

/**
 * In-memory, display-only timer. Starts with the navigation screen, is not
 * restarted by reroutes, and freezes actual walking time at arrival.
 * After-arrival time is NOT a GPS-verified physical visit/dwell measurement.
 */
export default function WalkTimeReadout({
  locale, phase, totalSeconds, totalDistanceMeters, remainingMeters,
}: WalkTimeReadoutProps) {
  const [startedAt] = useState(() => Date.now());
  const [arrivedAt, setArrivedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (phase === "preview") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "arrived" && arrivedAt === null) {
      const at = Date.now();
      setArrivedAt(at);
      setNow(at);
    }
  }, [phase, arrivedAt]);

  const copy = COPY[locale];
  const estimate = validRouteSeconds(totalSeconds);
  const estimatedRemaining = remainingRouteSeconds(totalSeconds, totalDistanceMeters, remainingMeters);
  const brief = (value: number | null) => {
    if (value === null) return copy.unknown;
    if (value < 60 && value > 0) return copy.lessThanMinute;
    return copy.approximately(Math.ceil(value / 60));
  };

  const sections: string[] = [`${copy.estimated}: ${brief(estimate)}`];
  if (phase !== "preview") {
    if (phase === "navigating") {
      const remainingText = estimatedRemaining !== null
        ? brief(estimatedRemaining)
        : estimate !== null && totalDistanceMeters !== null && totalDistanceMeters > 0 && remainingMeters == null
          ? copy.locating
          : copy.unknown;
      sections.push(`${copy.remaining}: ${remainingText}`);
    }
    const walkEnd = arrivedAt ?? now;
    const elapsed = Math.max(0, Math.floor((walkEnd - startedAt) / 1_000));
    sections.push(`${phase === "arrived" ? copy.actual : copy.elapsed}: ${elapsedClock(elapsed)}`);
    if (phase === "arrived" && arrivedAt !== null) {
      sections.push(`${copy.sinceArrival}: ${elapsedClock((now - arrivedAt) / 1_000)}`);
    }
  }
  return (
    <span className="walk-time-readout" role="timer" aria-label={copy.times}>
      {sections.join(" · ")}
    </span>
  );
}
