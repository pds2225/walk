"use client";
import type { FunnelEvent, StoreViewSource } from "./funnelEvents";

const SESSION_KEY = "walk:session-id";
// Fallback when sessionStorage is blocked: one id per page lifetime.
let memorySessionId: string | null = null;

function newId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Tab-scoped session id (sessionStorage), shared by page_view/store_view for bounce analysis. */
export function getSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = memorySessionId ?? newId();
    window.sessionStorage.setItem(SESSION_KEY, id);
    memorySessionId = id;
    return id;
  } catch {
    memorySessionId ??= newId();
    return memorySessionId;
  }
}

export interface TrackInput {
  readonly storeId?: string | null;
  readonly locale?: string | null;
  /** store_view source, language_change previous locale, etc. */
  readonly src?: StoreViewSource | string | null;
  /** store_leave dwell time in whole seconds. */
  readonly dwellSec?: number | null;
}

/**
 * Fire-and-forget funnel event to /api/track. Never throws, never blocks render.
 * The visitor id is the httpOnly ktrip_vid cookie, read on the server.
 */
export function track(event: FunnelEvent, input: TrackInput = {}): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      event,
      store_id: input.storeId ?? null,
      locale: input.locale ?? null,
      src: input.src ?? null,
      dwell_sec: input.dwellSec ?? null,
      session_id: getSessionId(),
      path: window.location.pathname,
    });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
      && navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }))) return;
    if (typeof fetch === "function") {
      void fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
    }
  } catch {
    // Tracking must never break the page.
  }
}
