"use client";

import "../worldcup-market.css";
import "../worldcup-market-mobile-overrides.css";
import "../worldcup-market-streetview.css";
import { useCallback, useEffect, useState } from "react";
import DestinationWalk from "../../components/DestinationWalk";
import WorldCupMarketDemo from "../../components/WorldCupMarketDemo";
import { getServiceMetadata, type Locale } from "../../lib/i18n";
import { htmlLangFor, resolveInitialLocale, syncLocaleToUrl, writeStoredLocale } from "../../lib/localePreference";
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
  // Held at null until mount so the resolved locale (URL > stored > browser
  // language > ko) renders on the first paint instead of flashing ko first.
  const [locale, setLocale] = useState<Locale | null>(null);
  const [target, setTarget] = useState<{ name: string; coordinate: Coordinate } | null>(null);

  useEffect(() => {
    setLocale(resolveInitialLocale());
  }, []);

  useEffect(() => {
    if (!locale) return;
    const metadata = getServiceMetadata(locale, "worldcup-market");
    document.title = metadata.title;
    document.documentElement.lang = htmlLangFor(locale);
    document.querySelector('meta[name="description"]')?.setAttribute("content", metadata.description);
    return () => { document.documentElement.lang = "ko"; };
  }, [locale]);

  const changeLocale = useCallback((next: Locale) => {
    writeStoredLocale(next);
    syncLocaleToUrl(next);
    setLocale(next);
  }, []);

  const startWalking = useCallback((next: { name: string; coordinate: Coordinate }) => {
    if (!locale) return;
    primeSpeech(locale);
    requestDeviceOrientationPermission();
    setTarget(next);
  }, [locale]);

  if (!locale) return null;

  if (target) {
    return (
      <DestinationWalk
        locale={locale}
        onLocaleChange={changeLocale}
        target={target}
        onStop={() => setTarget(null)}
      />
    );
  }

  return (
    <main>
      <WorldCupMarketDemo locale={locale} onLocaleChange={changeLocale} onStartWalking={startWalking} />
    </main>
  );
}
