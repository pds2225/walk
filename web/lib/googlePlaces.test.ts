// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GooglePlacesError,
  googleNearbyConfigured,
  searchNearbyGooglePlaces,
} from "./googlePlaces";

interface GoogleTestWindow extends Window {
  google?: unknown;
}

function setGoogle(value: unknown): void {
  (window as GoogleTestWindow).google = value;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete (window as GoogleTestWindow).google;
  document.getElementById("google-maps-sdk-streetview")?.remove();
});

describe("Google Places Nearby Search", () => {
  it("fails closed when the existing Google Maps key is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");

    expect(googleNearbyConfigured()).toBe(false);
    const rejection: unknown = await searchNearbyGooglePlaces({
      latitude: 25.033,
      longitude: 121.5654,
    }).then(() => null, (error: unknown) => error);

    expect(rejection).toBeInstanceOf(GooglePlacesError);
    expect((rejection as GooglePlacesError).reason).toBe("missing_key");
  });

  it("reuses the Google Maps JS loader, requests restaurants, and returns nearest first", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "gmaps-test");

    const searchNearby = vi.fn().mockResolvedValue({
      places: [
        {
          id: "far",
          displayName: "Far Restaurant",
          location: { lat: () => 25.04, lng: () => 121.5654 },
          formattedAddress: "Taipei far",
          googleMapsURI: "https://maps.google.com/?cid=far",
          rating: 4.3,
          userRatingCount: 90,
          primaryType: "restaurant",
        },
        {
          id: "near",
          displayName: "Near Restaurant",
          location: { lat: 25.0332, lng: 121.5654 },
          formattedAddress: "Taipei near",
          googleMapsURI: "https://maps.google.com/?cid=near",
          rating: 4.7,
          userRatingCount: 1200,
          primaryType: "restaurant",
        },
      ],
    });
    const importLibrary = vi.fn().mockResolvedValue({
      Place: { searchNearby },
      SearchNearbyRankPreference: { DISTANCE: "DISTANCE" },
    });
    setGoogle({ maps: { importLibrary } });

    const hits = await searchNearbyGooglePlaces(
      { latitude: 25.033, longitude: 121.5654 },
      { radiusMeters: 800, limit: 2 },
    );

    expect(importLibrary).toHaveBeenCalledWith("places");
    expect(searchNearby).toHaveBeenCalledTimes(1);
    expect(searchNearby.mock.calls[0]?.[0]).toMatchObject({
      locationRestriction: {
        center: { lat: 25.033, lng: 121.5654 },
        radius: 800,
      },
      includedPrimaryTypes: ["restaurant"],
      maxResultCount: 2,
      rankPreference: "DISTANCE",
    });
    expect(searchNearby.mock.calls[0]?.[0]?.fields).toEqual(expect.arrayContaining([
      "displayName",
      "location",
      "formattedAddress",
      "googleMapsURI",
      "rating",
      "userRatingCount",
    ]));
    expect(hits.map((hit) => hit.name)).toEqual(["Near Restaurant", "Far Restaurant"]);
    expect(hits[0]).toMatchObject({
      placeId: "near",
      address: "Taipei near",
      googleMapsUrl: "https://maps.google.com/?cid=near",
      rating: 4.7,
      reviewCount: 1200,
      primaryType: "restaurant",
    });
    expect(hits[0]?.distanceMeters).toBeLessThan(hits[1]?.distanceMeters ?? Infinity);
  });

  it("supports travel-category overrides and ignores results without coordinates", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "gmaps-test");

    const searchNearby = vi.fn().mockResolvedValue({
      places: [
        { id: "no-location", displayName: "No Location" },
        {
          id: "cafe",
          displayName: "Cafe",
          location: { lat: 25.034, lng: 121.5655 },
        },
      ],
    });
    setGoogle({
      maps: {
        importLibrary: vi.fn().mockResolvedValue({
          Place: { searchNearby },
          SearchNearbyRankPreference: { DISTANCE: "DISTANCE" },
        }),
      },
    });

    const hits = await searchNearbyGooglePlaces(
      { latitude: 25.033, longitude: 121.5654 },
      { includedPrimaryTypes: ["cafe", "bar"], radiusMeters: 999_999, limit: 999 },
    );

    expect(searchNearby.mock.calls[0]?.[0]).toMatchObject({
      locationRestriction: { radius: 50_000 },
      includedPrimaryTypes: ["cafe", "bar"],
      maxResultCount: 20,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.name).toBe("Cafe");
  });

  it("wraps Google search failures without leaking provider details", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "gmaps-test");

    setGoogle({
      maps: {
        importLibrary: vi.fn().mockResolvedValue({
          Place: {
            searchNearby: vi.fn().mockRejectedValue(new Error("provider failure")),
          },
          SearchNearbyRankPreference: { DISTANCE: "DISTANCE" },
        }),
      },
    });

    const rejection: unknown = await searchNearbyGooglePlaces({
      latitude: 25.033,
      longitude: 121.5654,
    }).then(() => null, (error: unknown) => error);

    expect(rejection).toBeInstanceOf(GooglePlacesError);
    expect((rejection as GooglePlacesError).reason).toBe("search_error");
    expect((rejection as GooglePlacesError).message).toBe("주변 장소 검색에 실패했습니다.");
  });
});
