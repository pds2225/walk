"use client";

import { useCallback, useState } from "react";
import DestinationWalk from "../../components/DestinationWalk";
import WorldCupMarketDemo from "../../components/WorldCupMarketDemo";
import type { Locale } from "../../lib/i18n";
import type { Coordinate } from "../../lib/types";
import { primeSpeech } from "../../lib/voice";

function requestDeviceOrientationPermission(): void {
  if (typeof window === "undefined") return;
  const ctor = (window as unknown as {
    DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
  }).DeviceOrientationEvent;
  void ctor?.requestPermission?.().catch(() => undefined);
}

export default function WorldCupMarketDemoPage() {
  const [locale, setLocale] = useState<Locale>("ko");
  const [target, setTarget] = useState<{ name: string; coordinate: Coordinate } | null>(null);

  const startWalking = useCallback((next: { name: string; coordinate: Coordinate }) => {
    primeSpeech(locale);
    requestDeviceOrientationPermission();
    setTarget(next);
  }, [locale]);

  if (target) {
    return (
      <DestinationWalk
        locale={locale}
        onLocaleChange={setLocale}
        target={target}
        onStop={() => setTarget(null)}
      />
    );
  }

  return (
    <main>
      <WorldCupMarketDemo locale={locale} onLocaleChange={setLocale} onStartWalking={startWalking} />
    </main>
  );
}
