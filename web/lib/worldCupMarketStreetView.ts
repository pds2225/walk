import type { Coordinate } from "./types";

/**
 * Official Google Maps Embed API, Street View mode.
 * https://developers.google.com/maps/documentation/embed/embedding-map#streetview_mode
 *
 * The undocumented `google.com/maps/embed?pb=` URL is not used. Without
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY this returns null. A pano ID selects that
 * panorama; otherwise the store coordinate and heading select the nearest
 * street-level imagery. This is a view near the store, not a confirmed frontage.
 * Blog addresses are geocoded separately. The demo only embeds imagery after
 * panorama availability is checked; a building coordinate does not prove frontage.
 */
const STREET_VIEW_EMBED_ENDPOINT = "https://www.google.com/maps/embed/v1/streetview";

export function documentedStreetViewEmbedUrl(input: {
  readonly panoId: string | null;
  readonly coordinate: Coordinate;
  readonly heading: number;
  readonly pitch: number;
}): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  if (!key) return null;
  const params = new URLSearchParams({
    key,
    location: `${input.coordinate.latitude},${input.coordinate.longitude}`,
    heading: String(Math.round(input.heading)),
    pitch: String(Math.round(input.pitch)),
    fov: "80",
  });
  const panoId = input.panoId?.trim() ?? "";
  if (panoId) params.set("pano", panoId);
  return `${STREET_VIEW_EMBED_ENDPOINT}?${params.toString()}`;
}
