"use client";

import "../worldcup-market.css";
import "../worldcup-market-mobile-overrides.css";
import "../worldcup-market-streetview.css";
import { useRef, useCallback, useEffect, useState } from "react";
import DestinationWalk from "../../components/DestinationWalk";
import LocationStorageConsent from "../../components/LocationStorageConsent";
import { track } from "../../lib/track";
import WorldCupMarketDemo from "../../components/WorldCupMarketDemo";
import { getServiceMetadata, type Locale } from "../../lib/i18n";
import { htmlLangFor, resolveInitialLocale, syncLocaleToUrl, writeStoredLocale } from "../../lib/localePreference";
import type { Coordinate } from "../../lib/types";
import { primeSpeech } from "../../lib/voice";
import { getNavGeoConsent } from "../../lib/wcmGeoConsent";

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
  const localeRef = useRef<Locale | null>(null);
  localeRef.current = locale;
  const [target, setTarget] = useState<{ name: string; coordinate: Coordinate; storeId?: string } | null>(null);
  const [pendingTarget, setPendingTarget] = useState<{ name: string; coordinate: Coordinate; storeId?: string } | null>(null);

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
    track("language_change", { locale: next, src: localeRef.current });
    writeStoredLocale(next);
    syncLocaleToUrl(next);
    setLocale(next);
  }, []);

  const beginWalking = useCallback((next: { name: string; coordinate: Coordinate; storeId?: string }) => {
    if (!locale) return;
    primeSpeech(locale);
    requestDeviceOrientationPermission();
    setTarget(next);
  }, [locale]);

  const startWalking = useCallback((next: { name: string; coordinate: Coordinate; storeId?: string }) => {
    if (!locale) return;
    // The first GPS storage choice must happen before asking browser geolocation.
    // Existing explicit yes/no choices are reused; a settings button remains in navigation.
    if (getNavGeoConsent() === null) {
      setPendingTarget(next);
      return;
    }
    beginWalking(next);
  }, [beginWalking, locale]);

  const resolveConsent = useCallback(() => {
    if (!pendingTarget) return;
    beginWalking(pendingTarget);
    setPendingTarget(null);
  }, [beginWalking, pendingTarget]);

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
      {pendingTarget ? <LocationStorageConsent locale={locale} mode="prompt" onResolved={resolveConsent} /> : null}
    </main>
  );
}
