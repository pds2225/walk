"use client";

import "../worldcup-market.css";
import "../worldcup-market-mobile-overrides.css";
import "../worldcup-market-streetview.css";
import { useCallback, useEffect, useState } from "react";
import DestinationWalk from "../../components/DestinationWalk";
import WorldCupMarketDemo from "../../components/WorldCupMarketDemo";
import { getServiceMetadata, type Locale } from "../../lib/i18n";
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

  useEffect(() => {
    const metadata = getServiceMetadata(locale, "worldcup-market");
    document.title = metadata.title;
    document.documentElement.lang = locale;
    document.querySelector('meta[name="description"]')?.setAttribute("content", metadata.description);
    return () => { document.documentElement.lang = "ko"; };
  }, [locale]);

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
