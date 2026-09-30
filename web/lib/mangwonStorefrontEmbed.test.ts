import { afterEach, describe, expect, it, vi } from "vitest";
import { documentedStreetViewEmbedUrl } from "./mangwonStorefrontEmbed";

const TARGET = { latitude: 37.556453, longitude: 126.9059867 };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("documented Mangwon street view embed", () => {
  it("stays unavailable when no Maps Embed API key is configured", () => {
    expect(documentedStreetViewEmbedUrl({
      panoId: "pano-test",
      coordinate: TARGET,
      heading: 91.4,
      pitch: 0,
    })).toBeNull();
    expect(documentedStreetViewEmbedUrl({
      panoId: null,
      coordinate: TARGET,
      heading: 0,
      pitch: 0,
    })).toBeNull();
  });

  it("uses the documented streetview embed endpoint and the pano when one is stored", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const url = documentedStreetViewEmbedUrl({
      panoId: "pano-test",
      coordinate: TARGET,
      heading: 91.4,
      pitch: 2.2,
    });
    expect(url?.startsWith("https://www.google.com/maps/embed/v1/streetview?")).toBe(true);
    expect(url).toContain("pano=pano-test");
    expect(url).toContain("location=37.556453%2C126.9059867");
    expect(url).toContain("heading=91");
    expect(url).toContain("pitch=2");
    expect(url).not.toContain("embed?pb=");
    expect(url).not.toContain("/maps/embed?pb=");
  });

  it("falls back to the store coordinate and a heading when no pano ID is stored", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const url = documentedStreetViewEmbedUrl({
      panoId: null,
      coordinate: TARGET,
      heading: 0,
      pitch: 0,
    });
    expect(url?.startsWith("https://www.google.com/maps/embed/v1/streetview?")).toBe(true);
    expect(url).toContain("location=37.556453%2C126.9059867");
    expect(url).toContain("heading=0");
    expect(url).not.toContain("pano=");
    expect(url).not.toContain("embed?pb=");
  });
});
