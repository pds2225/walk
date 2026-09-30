"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import RoadviewViewer from "./RoadviewViewer";
import { getUiText, LOCALE_OPTIONS, type Locale } from "../lib/i18n";
import type { RoadviewProvider } from "../lib/roadview";
import { selectRoadviewProvider } from "../lib/roadviewProviders";
import type { Coordinate, RouteResponse } from "../lib/types";
import { getCurrentPositionOnce, isDeviationFixReliable, useCompass, useWatchPosition } from "../lib/useGeolocation";
import type { Fix } from "../lib/useGeolocation";
import { useNavigation } from "../lib/useNavigation";

// The home page loads MapView the same way. This route must not import maplibre at module scope.
const MapView = dynamic(() => import("./MapView"), { ssr: false });

const REROUTE_WARMUP_SAMPLES = 5;
const REROUTE_WARMUP_MS = 30_000;
const REROUTE_COOLDOWN_MS = 3_000;

type Phase = "acquiring_location" | "routing" | "navigating" | "arrived" | "failed";

interface DestinationWalkProps {
  readonly locale: Locale;
  readonly onLocaleChange: (locale: Locale) => void;
  readonly target: { readonly name: string; readonly coordinate: Coordinate };
  readonly onStop: () => void;
}

function metersText(m: number | null | undefined): string {
  if (m === null || m === undefined) return "";
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}

function routeFingerprint(response: RouteResponse): string {
  return response.route.polyline
    .map((point) => `${point.latitude.toFixed(7)},${point.longitude.toFixed(7)}`)
    .join("|");
}

/**
 * Walking session for a store the Mangwon demo already selected.
 * It follows the same location → route → watch → reroute lifecycle as the home
 * guide, and it lives only on /mangwon so the production home stays unchanged.
 */
export default function DestinationWalk({ locale, onLocaleChange, target, onStop }: DestinationWalkProps) {
  const ui = getUiText(locale);
  const [routeResponse, setRouteResponse] = useState<RouteResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("acquiring_location");
  const [originFix, setOriginFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [headingUp, setHeadingUp] = useState(true);
  const [roadviewOpen, setRoadviewOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const wantWatch = phase === "navigating";
  const { fix, error: geoError } = useWatchPosition(wantWatch);
  const { headingDegrees: compass } = useCompass(wantWatch);
  const currentFix = fix ?? originFix;
  const navRoute = phase === "navigating" || phase === "arrived" ? routeResponse : null;
  const nav = useNavigation(navRoute, currentFix, { voiceEnabled, locale, rerouting });

  const navigationSession = useRef(0);
  const roadviewProvider = useRef<RoadviewProvider | null>(null);
  const phaseRef = useRef<Phase>(phase);
  const arrivedRef = useRef(nav.arrived);
  const copyRef = useRef(ui);
  phaseRef.current = phase;
  arrivedRef.current = nav.arrived;
  copyRef.current = ui;

  useEffect(() => {
    if (phase === "navigating" && nav.arrived) {
      navigationSession.current += 1;
      setRerouting(false);
      setPhase("arrived");
    }
  }, [phase, nav.arrived]);

  const rerouteAttemptedRoute = useRef<string | null>(null);
  const lastRerouteFixTimestamp = useRef<number | null>(null);
  const lastRerouteAtMs = useRef<number | null>(null);
  const requestReroute = useCallback(
    async (current: Fix) => {
      if (!routeResponse || rerouting) return;
      const session = navigationSession.current;
      setRerouting(true);
      try {
        const resp = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin: current, dest: target.coordinate }),
        });
        const body: unknown = await resp.json();
        if (
          navigationSession.current !== session ||
          phaseRef.current !== "navigating" ||
          arrivedRef.current
        ) {
          return;
        }
        if (!resp.ok) {
          setError((body as { error?: string }).error ?? ui.rerouteFailed);
          return;
        }
        setRouteResponse(body as RouteResponse);
        setOriginFix(current);
        setError(null);
      } catch {
        if (navigationSession.current === session && phaseRef.current === "navigating") {
          setError(ui.rerouteFailed);
        }
      } finally {
        if (navigationSession.current === session) setRerouting(false);
      }
    },
    [rerouting, routeResponse, target.coordinate, ui.rerouteFailed],
  );

  useEffect(() => {
    if (
      phase !== "navigating" ||
      !routeResponse ||
      !currentFix ||
      rerouting ||
      nav.result?.suggestedNextAction !== "reroute_candidate" ||
      !isDeviationFixReliable(currentFix.accuracyMeters) ||
      rerouteAttemptedRoute.current === routeFingerprint(routeResponse) ||
      lastRerouteFixTimestamp.current === currentFix.timestampMs ||
      (nav.sampleCount < REROUTE_WARMUP_SAMPLES && nav.elapsedSinceStartMs < REROUTE_WARMUP_MS) ||
      (lastRerouteAtMs.current !== null && Date.now() - lastRerouteAtMs.current < REROUTE_COOLDOWN_MS)
    ) {
      return;
    }
    rerouteAttemptedRoute.current = routeFingerprint(routeResponse);
    lastRerouteFixTimestamp.current = currentFix.timestampMs;
    lastRerouteAtMs.current = Date.now();
    void requestReroute(currentFix);
  }, [currentFix, nav.elapsedSinceStartMs, nav.result, nav.sampleCount, phase, requestReroute, rerouting, routeResponse]);

  useEffect(() => {
    const session = navigationSession.current + 1;
    navigationSession.current = session;
    roadviewProvider.current = selectRoadviewProvider();
    setPhase("acquiring_location");
    setError(null);
    setRerouting(false);
    setRoadviewOpen(false);
    rerouteAttemptedRoute.current = null;
    lastRerouteFixTimestamp.current = null;
    lastRerouteAtMs.current = null;

    void (async () => {
      let origin: Fix;
      try {
        origin = await getCurrentPositionOnce();
      } catch (err) {
        if (navigationSession.current !== session) return;
        setError(err instanceof Error ? err.message : copyRef.current.locating);
        setPhase("failed");
        return;
      }
      if (navigationSession.current !== session) return;
      setPhase("routing");
      try {
        const resp = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin, dest: target.coordinate }),
        });
        const body: unknown = await resp.json();
        if (navigationSession.current !== session) return;
        if (!resp.ok) {
          setError((body as { error?: string }).error ?? copyRef.current.routeFailed);
          setPhase("failed");
          return;
        }
        setRouteResponse(body as RouteResponse);
        setOriginFix(origin);
        setPhase("navigating");
      } catch {
        if (navigationSession.current !== session) return;
        setError(copyRef.current.routeFailed);
        setPhase("failed");
      }
    })();

    return () => {
      navigationSession.current += 1;
    };
  }, [attempt, target.coordinate]);

  const stop = useCallback(() => {
    navigationSession.current += 1;
    onStop();
  }, [onStop]);

  if ((phase === "navigating" || phase === "arrived") && routeResponse) {
    const offRoute = nav.state === "deviated" || nav.state === "passed_turn";
    const directionReadout = compass !== null
      ? ui.viewDirection(Math.round(compass))
      : nav.movementHeadingDegrees !== null
        ? ui.movementDirection(Math.round(nav.movementHeadingDegrees))
        : ui.waitingDirection;
    return (
      <main className="nav-screen">
        <div className="language-bar">
          <label>
            <span className="visually-hidden">{ui.language}</span>
            <select aria-label={ui.language} value={locale} onChange={(event) => onLocaleChange(event.target.value as Locale)}>
              {LOCALE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div className={`banner ${offRoute ? "banner-off" : nav.state === "drifting" ? "banner-warn" : ""}`}>
          <strong>{rerouting ? ui.rerouting : nav.banner}</strong>
          <span>
            {nav.remainingMeters !== null ? ui.remaining(metersText(nav.remainingMeters)) : ""}
            {nav.nextTurn && nav.nextTurn.direction !== "straight"
              ? ` · ${ui.turnAhead(metersText(nav.nextTurn.distanceMeters), ui.turn(nav.nextTurn.direction))}`
              : ""}
          </span>
          <span className="direction-readout" aria-label={ui.directionStatus}>{directionReadout}</span>
        </div>
        <MapView
          route={routeResponse.route}
          here={currentFix}
          viewHeadingDegrees={compass}
          movementHeadingDegrees={nav.movementHeadingDegrees ?? currentFix?.headingDegrees ?? null}
          headingUp={headingUp}
          offRoute={offRoute}
        />
        <div className="roadview-entry">
          {!roadviewOpen ? (
            <button type="button" onClick={() => setRoadviewOpen(true)}>{ui.roadviewButton}</button>
          ) : (
            <RoadviewViewer
              destination={target.coordinate}
              destinationName={target.name}
              approachOrigin={currentFix}
              locale={locale}
              provider={roadviewProvider.current}
              onClose={() => setRoadviewOpen(false)}
            />
          )}
        </div>
        <div className="nav-actions">
          <button type="button" onClick={() => setHeadingUp((value) => !value)}>
            {headingUp ? ui.northUp : ui.movementUp}
          </button>
          <button type="button" onClick={() => setVoiceEnabled((value) => !value)}>
            {voiceEnabled ? ui.voiceOff : ui.voiceOn}
          </button>
          <button type="button" className="stop" onClick={stop}>{ui.stop}</button>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {geoError ? <p className="error">{geoError}</p> : null}
      </main>
    );
  }

  return (
    <main className="home">
      <h1>{target.name}</h1>
      <p className="hint" role="status">
        {phase === "routing" ? ui.findingRoute : phase === "failed" ? (error ?? ui.routeFailed) : ui.locating}
      </p>
      {phase === "failed" ? (
        <button type="button" className="primary" onClick={() => setAttempt((value) => value + 1)}>
          {ui.startWalking}
        </button>
      ) : null}
      <button type="button" className="stop" onClick={stop}>{ui.stop}</button>
    </main>
  );
}
