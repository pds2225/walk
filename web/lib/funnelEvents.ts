/** Funnel events for /worldcup-market (shared by client and /api/track). */
export const FUNNEL_EVENTS = ["page_view", "store_view", "phone_click", "map_pin_click", "directions", "language_change", "section_view", "store_leave", "my_location_click"] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** How a store detail was reached. "qr" is set server-side from the /q landing cookie. */
export const STORE_VIEW_SOURCES = ["qr", "map", "list", "nearby", "switcher", "deeplink"] as const;
export type StoreViewSource = (typeof STORE_VIEW_SOURCES)[number];

export const STORE_VIEW_DEDUPE_SECONDS = 3 * 60;
export const STORE_VIEW_COOKIE_PREFIX = "ktrip_sv_";

export function isFunnelEvent(value: unknown): value is FunnelEvent {
  return typeof value === "string" && (FUNNEL_EVENTS as readonly string[]).includes(value);
}

/** Store detail sections tracked by section_view (src = section name). */
export const DETAIL_SECTIONS = ["menu", "location", "nearby"] as const;
export type DetailSection = (typeof DETAIL_SECTIONS)[number];
export const MAX_DWELL_SECONDS = 86400;
