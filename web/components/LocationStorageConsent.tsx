"use client";
import { useEffect, useState } from "react";
import type { Locale } from "../lib/i18n";
import { GEO_CONSENT_TEXT, getGeoConsent, setGeoConsent } from "../lib/wcmGeoConsent";
import { getWalkGeoConsent, setWalkGeoConsent } from "../lib/navigationAnalytics";

export default function LocationStorageConsent({ locale, market = false }: { locale: Locale; market?: boolean }) {
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);
  useEffect(() => { setChoice(market ? getGeoConsent() : getWalkGeoConsent()); }, [market]);
  const copy = GEO_CONSENT_TEXT[locale];
  function choose(value: "yes" | "no") {
    if (market) setGeoConsent(value); else setWalkGeoConsent(value);
    setChoice(market ? getGeoConsent() : getWalkGeoConsent());
  }
  return <details className="location-storage-consent" style={{ padding: "12px", background: "#fff", color: "#17212b" }}>
    <summary>{copy.label}: {choice === "yes" ? copy.yes : copy.no}</summary>
    <p>{copy.before}<a href={market ? "/worldcup-market/privacy" : "/privacy"} target="_blank" rel="noreferrer">{copy.link}</a>{copy.after}</p>
    <button type="button" aria-pressed={choice === "yes"} onClick={() => choose("yes")}>{copy.yes}</button>{" "}
    <button type="button" aria-pressed={choice !== "yes"} onClick={() => choose("no")}>{copy.no}</button>
  </details>;
}
