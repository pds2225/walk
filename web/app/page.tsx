"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentPositionOnce, isDeviationFixReliable, useCompass, useWatchPosition } from "../lib/useGeolocation";
import type { Fix } from "../lib/useGeolocation";
import { useNavigation } from "../lib/useNavigation";
import type { Coordinate, PlaceHit, RouteResponse } from "../lib/types";
import { getUiText, LOCALE_OPTIONS, type Locale } from "../lib/i18n";
import { primeSpeech } from "../lib/voice";
import RoadviewViewer from "../components/RoadviewViewer";
import { ROADVIEW_TRIGGER_DISTANCE_M } from "../lib/roadview";

// maplibre 는 window 를 직접 만져 서버 렌더가 불가능하다 — 클라이언트에서만 불러온다.
const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

const RECENT_KEY = "walk.recent.v1";
const RECENT_ROW = 3;      // 첫 화면에 가로로 놓을 최근 목적지 개수
const RECENT_MAX = 9;      // '＋'로 펼쳤을 때 최대 개수
const SEARCH_DEBOUNCE_MS = 250;
// Streamlit navigation과 동일한 재탐색 보호값. 시작 직후 위치 안정화 기간에는
// route provider를 부르지 않고, 이후에도 짧은 시간 내 요청을 중복하지 않는다.
const REROUTE_WARMUP_SAMPLES = 5;
const REROUTE_WARMUP_MS = 30_000;
const REROUTE_COOLDOWN_MS = 3_000;
const LOCALE_KEY = "walk.locale.v1";

/**
 * 목적지 검색/선택과 실시간 GPS 내비게이션은 서로 다른 화면이자 서로 다른 lifecycle
 * 이다. idle/destination_selected/acquiring_location/routing/arrived 동안에는 어떤
 * geolocation API 도 호출되지 않는다 — navigating에서만
 * watchPosition 이 켜진다. 목적지를 고르는 것만으로 GPS 구독이 시작되던 것이
 * 화면이 계속 깜빡이던 근본 원인이었다.
 */
type Phase = "idle" | "destination_selected" | "acquiring_location" | "routing" | "navigating" | "arrived";

interface Recent {
  readonly name: string;
  readonly coordinate: Coordinate;
}

function loadRecents(): Recent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Recent[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function loadLocale(): Locale {
  if (typeof window === "undefined") return "ko";
  const value = window.localStorage.getItem(LOCALE_KEY);
  return LOCALE_OPTIONS.some((option) => option.value === value) ? (value as Locale) : "ko";
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

export default function Home() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  // 결과가 0건일 때 '왜 없는지'. 소스가 조용히 죽으면 '장소 없음'과 구별이 안 된다.
  const [missHint, setMissHint] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [dest, setDest] = useState<Recent | null>(null);
  const [routeResponse, setRouteResponse] = useState<RouteResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  // '걷기' 클릭 때 얻은 1회성 위치 — navigating 진입 직후, 아직 첫 watchPosition
  // 틱이 오기 전에도 지도가 빈 채로 뜨지 않도록 잠깐 대신 쓴다.
  const [originFix, setOriginFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [headingUp, setHeadingUp] = useState(true);
  const [locale, setLocale] = useState<Locale>("ko");
  const [roadviewOpen, setRoadviewOpen] = useState(false);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [recentsExpanded, setRecentsExpanded] = useState(false);

  useEffect(() => {
    setRecents(loadRecents());
    setLocale(loadLocale());
  }, []);

  const ui = getUiText(locale);

  const changeLocale = useCallback((value: Locale) => {
    setLocale(value);
    try {
      window.localStorage.setItem(LOCALE_KEY, value);
    } catch {
      /* 저장 실패해도 현재 내비게이션의 언어 전환은 유지한다. */
    }
  }, []);

  // 실시간 GPS 구독은 오직 navigating 에서만 켠다 — 목적지를 고르는 것만으로는
  // 절대 켜지지 않는다.
  const wantWatch = phase === "navigating";
  const { fix, error: geoError } = useWatchPosition(wantWatch);
  const { headingDegrees: compass, request: requestCompass } = useCompass(wantWatch);
  const currentFix = fix ?? originFix;

  // 도착 화면에서는 새 GPS를 받지 않지만 마지막 active route와 arrival 결과는
  // 유지해야 한다. null을 넘기면 hook이 arrival 상태까지 초기화하기 때문이다.
  const navRoute = phase === "navigating" || phase === "arrived" ? routeResponse : null;
  const nav = useNavigation(navRoute, currentFix, { voiceEnabled, locale, rerouting });

  // 비동기 route 응답이 안내 중지/새 세션 뒤에 도착해 현재 상태를 덮어쓰지
  // 않도록 세션과 최신 lifecycle 상태를 동기적으로 보관한다.
  const navigationSession = useRef(0);
  const phaseRef = useRef<Phase>(phase);
  const arrivedRef = useRef(nav.arrived);
  phaseRef.current = phase;
  arrivedRef.current = nav.arrived;

  // 엔진이 도착으로 판정하면 phase 도 따라간다 — GPS 동작(watchPosition 유지)은
  // arrived 전환과 함께 watcher도 해제된다.
  useEffect(() => {
    if (phase === "navigating" && nav.arrived) {
      navigationSession.current += 1;
      setRerouting(false);
      setPhase("arrived");
    }
  }, [phase, nav.arrived]);

  /**
   * 확정 이탈/놓친 회전마다 route API를 매 GPS 틱 재호출하지 않는다. 하나의
   * active route에서 첫 `reroute_candidate`만 자동 재탐색하고, 실패해도 기존
   * 경로와 안내는 유지한다. 새 경로가 설치되면 route fingerprint가 바뀌어
   * 다음 이탈 episode에서 다시 시도할 수 있다.
  */
  const rerouteAttemptedRoute = useRef<string | null>(null);
  const lastRerouteFixTimestamp = useRef<number | null>(null);
  const lastRerouteAtMs = useRef<number | null>(null);
  const requestReroute = useCallback(
    async (current: Fix) => {
      if (!dest || !routeResponse || rerouting) return;
      const session = navigationSession.current;
      setRerouting(true);
      try {
        const resp = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin: current, dest: dest.coordinate }),
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
    [dest, rerouting, routeResponse, ui.rerouteFailed],
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

  // ── 목적지 검색 (입력이 멈춘 뒤 1회) ──────────────────────────────────────
  // fix 는 navigating/arrived 가 아닌 동안은 절대 바뀌지 않는다(watchPosition 이
  // 꺼져 있으므로) — 이 화면(검색)에 있는 동안은 그냥 고정값이라, deps 에 넣을
  // 필요도, ref 로 우회할 필요도 없다.
  const searchSeq = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (!q || dest) {
      setHits([]);
      setMissHint(null);
      setSearched(false);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (fix) {
          params.set("lat", String(fix.latitude));
          params.set("lon", String(fix.longitude));
        }
        const resp = await fetch(`/api/places?${params}`);
        const body: unknown = await resp.json();
        // 타이핑이 계속돼 더 새로운 요청이 나갔으면 이 응답은 버린다(순서 뒤집힘 방지).
        if (seq !== searchSeq.current) return;
        setHits(resp.ok ? ((body as { hits?: PlaceHit[] }).hits ?? []) : []);
        setMissHint(resp.ok ? ((body as { hint?: string | null }).hint ?? null) : null);
        setError(resp.ok ? null : ((body as { error?: string }).error ?? null));
        setSearched(true);
      } catch {
        if (seq === searchSeq.current) {
          setHits([]);
          setMissHint(null);
          setSearched(true);
        }
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, dest]);

  const rememberRecent = useCallback((entry: Recent) => {
    setRecents((prev) => {
      const next = [entry, ...prev.filter((r) => r.name !== entry.name)].slice(0, RECENT_MAX);
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* 저장 실패(사파리 시크릿 등)해도 이번 세션 동작에는 지장이 없다 */
      }
      return next;
    });
  }, []);

  const startWalking = useCallback(
    async (target: Recent) => {
      primeSpeech(locale); // 모바일 브라우저가 사용자 제스처 뒤의 TTS를 허용하도록 예열한다
      // iOS DeviceOrientation 권한은 비동기 위치/경로 요청 뒤에는 사용자 제스처로
      // 간주되지 않을 수 있으므로, 첫 await 전에 요청한다.
      requestCompass();
      const session = navigationSession.current + 1;
      navigationSession.current = session;
      setDest(target);
      setQuery(target.name);
      setError(null);
      setRerouting(false);
      rerouteAttemptedRoute.current = null;
      lastRerouteFixTimestamp.current = null;
      lastRerouteAtMs.current = null;
      setPhase("acquiring_location");
      let origin: Fix;
      try {
        origin = await getCurrentPositionOnce();
      } catch (err) {
        if (navigationSession.current !== session) return;
        setError(err instanceof Error ? err.message : ui.locating);
        setPhase("destination_selected");
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
          setError((body as { error?: string }).error ?? ui.routeFailed);
          setPhase("destination_selected");
          return;
        }
        setRouteResponse(body as RouteResponse);
        setOriginFix(origin);
        rememberRecent(target);
        setPhase("navigating");   // 이 시점부터만 watchPosition 이 시작된다
      } catch {
        if (navigationSession.current !== session) return;
        setError(ui.routeFailed);
        setPhase("destination_selected");
      }
    },
    [locale, rememberRecent, requestCompass, ui.routeFailed, ui.locating],
  );

  const pick = useCallback((hit: PlaceHit) => {
    const entry: Recent = { name: hit.name, coordinate: hit.coordinate };
    setDest(entry);
    setQuery(hit.name);
    setHits([]);
    setPhase("destination_selected");
  }, []);

  const reset = useCallback(() => {
    navigationSession.current += 1;
    setPhase("idle");
    setRouteResponse(null);
    setOriginFix(null);
    setDest(null);
    setQuery("");
    setHits([]);
    setError(null);
    setRerouting(false);
    setRoadviewOpen(false);
    rerouteAttemptedRoute.current = null;
    lastRerouteFixTimestamp.current = null;
    lastRerouteAtMs.current = null;
  }, []);

  const onQueryChange = useCallback((value: string) => {
    setQuery(value);
    setDest(null);
    setPhase((p) => (p === "navigating" || p === "arrived" ? p : "idle"));
  }, []);

  // ── 안내 중 화면 ──────────────────────────────────────────────────────────
  if ((phase === "navigating" || phase === "arrived") && routeResponse) {
    const offRoute = nav.state === "deviated" || nav.state === "passed_turn";
    const roadviewTrigger = nav.remainingMeters !== null && nav.remainingMeters <= ROADVIEW_TRIGGER_DISTANCE_M;
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
            <select aria-label={ui.language} value={locale} onChange={(e) => changeLocale(e.target.value as Locale)}>
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

        {roadviewTrigger && dest ? (
          <div className="roadview-entry">
            {!roadviewOpen ? (
              <button type="button" onClick={() => setRoadviewOpen(true)}>{ui.roadviewButton}</button>
            ) : (
              <RoadviewViewer
                destination={dest.coordinate}
                destinationName={dest.name}
                approachOrigin={currentFix}
                locale={locale}
                onClose={() => setRoadviewOpen(false)}
              />
            )}
          </div>
        ) : null}

        <div className="nav-actions">
          <button type="button" onClick={() => setHeadingUp((v) => !v)}>
            {headingUp ? ui.northUp : ui.movementUp}
          </button>
          <button type="button" onClick={() => setVoiceEnabled((v) => !v)}>
            {voiceEnabled ? ui.voiceOff : ui.voiceOn}
          </button>
          <button type="button" className="stop" onClick={reset}>
            {ui.stop}
          </button>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {geoError ? <p className="error">{geoError}</p> : null}
      </main>
    );
  }

  // ── 첫 화면: 목적지 + 버튼 ────────────────────────────────────────────────
  const busy = phase === "acquiring_location" || phase === "routing";
  const shown = recentsExpanded ? recents : recents.slice(0, RECENT_ROW);
  return (
    <main className="home">
      <div className="language-bar">
        <label>
          <span className="visually-hidden">{ui.language}</span>
          <select aria-label={ui.language} value={locale} onChange={(e) => changeLocale(e.target.value as Locale)}>
            {LOCALE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <h1>{ui.homeTitle}</h1>

      <input
        className="dest-input"
        type="search"
        inputMode="search"
        placeholder={ui.destinationPlaceholder}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label={ui.destination}
      />

      {searching ? <p className="hint">{ui.searchLoading}</p> : null}

      {searched && !searching && hits.length === 0 && !dest ? (
        <>
          <p className="hint">{ui.noMatch(query.trim())}</p>
          {missHint ? <p className="error">⚠️ {missHint}</p> : null}
        </>
      ) : null}

      {hits.length > 0 ? (
        <ul className="hits">
          {hits.map((hit) => (
            <li key={`${hit.name}-${hit.coordinate.latitude}-${hit.coordinate.longitude}`}>
              <button type="button" onClick={() => pick(hit)}>
                <span className="hit-name">{hit.name}</span>
                {hit.distanceMeters !== undefined ? (
                  <span className="hit-dist">{metersText(hit.distanceMeters)}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {shown.length > 0 ? (
        <>
          <p className="hint">{ui.recents}</p>
          <div className="chips">
            {shown.map((r) => (
              <button
                key={r.name}
                type="button"
                className="chip"
                disabled={busy}
                onClick={() => void startWalking(r)}
              >
                {r.name}
              </button>
            ))}
            {recents.length > RECENT_ROW ? (
              <button
                type="button"
                className="chip chip-more"
                onClick={() => setRecentsExpanded((v) => !v)}
                aria-label={recentsExpanded ? ui.collapse : ui.moreRecent}
              >
                {recentsExpanded ? "−" : "＋"}
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      <button
        type="button"
        className="primary"
        disabled={!dest || busy}
        onClick={() => dest && void startWalking(dest)}
      >
        {phase === "acquiring_location" ? ui.locating : phase === "routing" ? ui.findingRoute : ui.startWalking}
      </button>

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
