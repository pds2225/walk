import { afterEach, describe, expect, it, vi } from "vitest";
import { documentedStorefrontEmbedUrl } from "./mangwonStorefrontEmbed";

const TARGET = { latitude: 37.556453, longitude: 126.9059867 };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("documented Mangwon storefront embed", () => {
  it("stays unavailable when no Maps Embed API key is configured", () => {
    expect(documentedStorefrontEmbedUrl({
      panoId: "pano-test",
      coordinate: TARGET,
      heading: 91.4,
      pitch: 0,
    })).toBeNull();
  });

  it("uses the documented streetview embed endpoint and not a pb= URL", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const url = documentedStorefrontEmbedUrl({
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
});
