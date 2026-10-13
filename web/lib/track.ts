"use client";
import type { FunnelEvent, StoreViewSource } from "./funnelEvents";

const SESSION_KEY = "walk:session-id";

function sessionId(): string | null {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return null;
  }
}

export interface TrackInput {
  readonly storeId?: string | null;
  readonly locale?: string | null;
  /** store_view source, language_change previous locale, etc. */
  readonly src?: StoreViewSource | string | null;
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
      session_id: sessionId(),
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
