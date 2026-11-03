"use client";
import { track, type TrackInput } from "./track";
import { getGeoConsent } from "./wcmGeoConsent";
import type { WalkEvent } from "./funnelEvents";

export const WALK_GEO_CONSENT_KEY = "walk:geo-consent";
export function getWalkGeoConsent(): "yes" | "no" | null {
  try { const value = window.localStorage.getItem(WALK_GEO_CONSENT_KEY); return value === "yes" || value === "no" ? value : null; }
  catch { return null; }
}
export function setWalkGeoConsent(value: "yes" | "no"): void {
  try { window.localStorage.setItem(WALK_GEO_CONSENT_KEY, value); } catch { /* 저장 불가 시 동의하지 않은 것으로 처리 */ }
}

/** 한 보행 시도의 식별자를 관리한다. 좌표는 보관하지 않고 매 전송 때 현재 동의를 확인한다. */
export function createNavigationAnalytics(send: typeof track = track) {
  let id: string | null = null;
  let storeId: string | null = null;
  let active = false;
  function event(event: WalkEvent, input: TrackInput = {}) {
    if (!id || !active) return;
    const consent = storeId ? getGeoConsent() === "yes" : getWalkGeoConsent() === "yes";
    send(event, { ...input, storeId, navigationId: id, geoConsent: consent, position: consent ? input.position ?? null : null });
    if (event === "arrive" || event === "nav_stop") active = false;
  }
  return {
    begin(nextStoreId: string | null = null) {
      if (active) event("nav_stop");
      id = crypto.randomUUID(); storeId = nextStoreId; active = true;
      return id;
    },
    event,
    stop(input: TrackInput = {}) { event("nav_stop", input); },
    get id() { return id; },
  };
}
