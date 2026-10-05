import { afterEach, describe, expect, it, vi } from "vitest";
import { documentedStreetViewEmbedUrl } from "./worldCupMarketStreetView";

const SAMPLE = { latitude: 35.1, longitude: 127.2 };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("documented street view embed", () => {
  it("stays unavailable when no Maps Embed API key is configured", () => {
    expect(documentedStreetViewEmbedUrl({
      panoId: "pano-test",
      coordinate: SAMPLE,
      heading: 91.4,
      pitch: 0,
    })).toBeNull();
    expect(documentedStreetViewEmbedUrl({
      panoId: null,
      coordinate: SAMPLE,
      heading: 0,
      pitch: 0,
    })).toBeNull();
  });

  it("uses the documented streetview embed endpoint and the pano when one is stored", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const url = documentedStreetViewEmbedUrl({
      panoId: "pano-test",
      coordinate: SAMPLE,
      heading: 91.4,
      pitch: 2.2,
    });
    expect(url?.startsWith("https://www.google.com/maps/embed/v1/streetview?")).toBe(true);
    expect(url).toContain("pano=pano-test");
    expect(url).toContain("location=35.1%2C127.2");
    expect(url).toContain("heading=91");
    expect(url).toContain("pitch=2");
    expect(url).not.toContain("embed?pb=");
    expect(url).not.toContain("/maps/embed?pb=");
  });

  it("falls back to the coordinate and a heading when no pano ID is stored", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const url = documentedStreetViewEmbedUrl({
      panoId: null,
      coordinate: SAMPLE,
      heading: 0,
      pitch: 0,
    });
    expect(url?.startsWith("https://www.google.com/maps/embed/v1/streetview?")).toBe(true);
    expect(url).toContain("location=35.1%2C127.2");
    expect(url).toContain("heading=0");
    expect(url).not.toContain("pano=");
    expect(url).not.toContain("embed?pb=");
  });
});
