"use client";

import { track, type TrackInput } from "./track";
import type { WalkEvent } from "./funnelEvents";
import { getNavGeoConsent } from "./wcmGeoConsent";

/**
 * One K-Trip store walking attempt = one UUID. This does not alter WALK home
 * navigation or its existing analytics. Consent is rechecked at EVERY sample.
 */
export function createNavigationAnalytics(send: typeof track = track) {
  let id: string | null = null;
  let storeId: string | null = null;
  let active = false;

  function event(event: WalkEvent, input: TrackInput = {}) {
    if (!id || !storeId || !active) return;
    const consent = getNavGeoConsent() === "yes";
    send(event, {
      ...input,
      storeId,
      navigationId: id,
      geoConsent: consent,
      position: consent ? input.position ?? null : null,
    });
    if (event === "arrive") active = false;
  }

  return {
    begin(nextStoreId: string | null) {
      active = false;
      storeId = nextStoreId;
      id = nextStoreId && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null;
      active = Boolean(id && storeId);
      return id;
    },
    event,
    stop() { active = false; },
    get id() { return id; },
  };
}
