import type { Coordinate } from "./types";

/**
 * Official Google Maps Embed API, Street View mode.
 * https://developers.google.com/maps/documentation/embed/embedding-map#streetview_mode
 *
 * The undocumented `google.com/maps/embed?pb=` URL is not used. Without a
 * configured browser key this returns null, and the storefront UI says the
 * view is unavailable. Real Street View integration is still a TASK.md §11
 * non-goal until the owner approves the key, billing, and terms.
 */
const STREET_VIEW_EMBED_ENDPOINT = "https://www.google.com/maps/embed/v1/streetview";

export function documentedStorefrontEmbedUrl(input: {
  readonly panoId: string;
  readonly coordinate: Coordinate;
  readonly heading: number;
  readonly pitch: number;
}): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  if (!key || !input.panoId) return null;
  const params = new URLSearchParams({
    key,
    pano: input.panoId,
    location: `${input.coordinate.latitude},${input.coordinate.longitude}`,
    heading: String(Math.round(input.heading)),
    pitch: String(Math.round(input.pitch)),
    fov: "80",
  });
  return `${STREET_VIEW_EMBED_ENDPOINT}?${params.toString()}`;
}
