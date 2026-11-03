// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNavigationAnalytics, setWalkGeoConsent } from "./navigationAnalytics";
import { setGeoConsent } from "./wcmGeoConsent";
const position = { latitude: 37.55, longitude: 126.9, accuracyMeters: 10 };
afterEach(() => { window.localStorage.clear(); });
describe("navigation attribution and consent", () => {
  it("keeps one ID through reroutes and arrival, and uses another ID for store 05", () => {
    const send = vi.fn(), nav = createNavigationAnalytics(send);
    const first = nav.begin("worldcup-market-23");
    nav.event("nav_start", { position }); nav.event("reroute"); nav.event("arrive"); nav.stop();
    expect(send).toHaveBeenCalledTimes(3);
    for (const [, input] of send.mock.calls) expect(input).toMatchObject({ navigationId: first, storeId: "worldcup-market-23", position: null, geoConsent: false });
    const second = nav.begin("worldcup-market-05"); nav.event("nav_start");
    expect(second).not.toBe(first);
    expect(send.mock.lastCall![1]).toMatchObject({ navigationId: second, storeId: "worldcup-market-05" });
  });
  it("drops raw coordinates after decline or withdrawal without stopping event logging", () => {
    const send = vi.fn(), nav = createNavigationAnalytics(send); nav.begin();
    nav.event("nav_start", { position });
    expect(send.mock.lastCall![1].position).toBeNull();
    setWalkGeoConsent("yes"); nav.event("nav_progress", { position });
    expect(send.mock.lastCall![1]).toMatchObject({ position, geoConsent: true });
    setWalkGeoConsent("no"); nav.event("reroute", { position });
    expect(send.mock.lastCall![1]).toMatchObject({ position: null, geoConsent: false });
  });
  it("keeps market and general WALK consent independent and stops a replaced session", () => {
    const send = vi.fn(), nav = createNavigationAnalytics(send);
    setWalkGeoConsent("yes"); nav.begin("worldcup-market-23"); nav.event("nav_start", { position });
    expect(send.mock.lastCall![1].position).toBeNull();
    setGeoConsent("yes"); nav.event("reroute", { position }); expect(send.mock.lastCall![1].position).toEqual(position);
    nav.begin("worldcup-market-05"); expect(send.mock.lastCall![0]).toBe("nav_stop");
  });
});
