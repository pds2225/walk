/** Funnel events for /worldcup-market (shared by client and /api/track). */
export const FUNNEL_EVENTS = ["page_view", "store_view", "phone_click", "map_pin_click", "directions", "language_change", "section_view", "store_leave", "my_location_click"] as const;
/** WALK walking-nav app (/) step events. Stored with app = 'walk'; never mixed with K-TRIP. */
export const WALK_EVENTS = ["home_view", "search", "destination_select", "nav_start", "nav_progress", "reroute", "arrive", "route_error"] as const;
/**
 * WALK nav position logging (lat/lng/accuracy, never IP). Turn off here (client stops sending)
 * or set Vercel env WALK_STORE_COORDS=off (server drops coordinates). K-TRIP never sends coordinates.
 */
export const WALK_STORE_COORDS = true;
export const WALK_COORD_EVENTS = ["nav_start", "nav_progress", "reroute", "arrive"] as const;
export const WALK_PROGRESS_INTERVAL_MS = 30_000;
export const WALK_PROGRESS_DISTANCE_M = 50;
export type WalkEvent = (typeof WALK_EVENTS)[number];
export const WALK_ERROR_TYPES = ["location", "route_http", "route_network", "reroute_http", "reroute_network", "search_http", "search_network"] as const;
export type WalkErrorType = (typeof WALK_ERROR_TYPES)[number];
/** destination_select source; search result outcome (hit/miss). */
export const WALK_SOURCES = ["search", "recent", "hit", "miss"] as const;
export const WALK_HOME_VIEW_DEDUPE_SECONDS = 3 * 60;
export const WALK_HOME_VIEW_COOKIE = "walk_hv";
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number] | WalkEvent;
export function isWalkEvent(value: unknown): value is WalkEvent {
  return typeof value === "string" && (WALK_EVENTS as readonly string[]).includes(value);
}

/** How a store detail was reached. "qr" is set server-side from the /q landing cookie. */
export const STORE_VIEW_SOURCES = ["qr", "map", "list", "nearby", "switcher", "deeplink"] as const;
export type StoreViewSource = (typeof STORE_VIEW_SOURCES)[number];

export const STORE_VIEW_DEDUPE_SECONDS = 3 * 60;
export const STORE_VIEW_COOKIE_PREFIX = "ktrip_sv_";

export function isFunnelEvent(value: unknown): value is FunnelEvent {
  return typeof value === "string" && ((FUNNEL_EVENTS as readonly string[]).includes(value) || isWalkEvent(value));
}

/** Store detail sections tracked by section_view (src = section name). */
export const DETAIL_SECTIONS = ["menu", "location", "nearby"] as const;
export type DetailSection = (typeof DETAIL_SECTIONS)[number];
export const MAX_DWELL_SECONDS = 86400;
