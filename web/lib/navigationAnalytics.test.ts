// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNavigationAnalytics } from "./navigationAnalytics";
import { setGeoConsent, setNavGeoConsent } from "./wcmGeoConsent";

const fix = { latitude: 37.5587, longitude: 126.9051, accuracyMeters: 9 };
const firstId = "a1b2c3d4-1234-4abc-8def-1234567890ab";
const secondId = "a1b2c3d4-1234-4abc-8def-1234567890ac";
let uuid: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  uuid = vi.fn().mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
  vi.stubGlobal("crypto", { randomUUID: uuid });
});
afterEach(() => { window.localStorage.clear(); vi.unstubAllGlobals(); });

describe("K-Trip GPS route consent and navigation ID", () => {
  it("never records coordinates from an old one-off location-storage consent", () => {
    const send = vi.fn(), nav = createNavigationAnalytics(send);
    setGeoConsent("yes");
    const id = nav.begin("worldcup-market-01");
    nav.event("nav_start", { position: fix, locale: "ko" });
    expect(id).toBe(firstId);
    expect(send).toHaveBeenCalledWith("nav_start", expect.objectContaining({
      navigationId: id, storeId: "worldcup-market-01", geoConsent: false, position: null,
    }));
  });

  it("links consented fixes, reroute and arrival under the same ID", () => {
    const send = vi.fn(), nav = createNavigationAnalytics(send);
    setNavGeoConsent("yes");
    nav.begin("worldcup-market-01");
    nav.event("nav_start", { position: fix, locale: "ko" });
    nav.event("nav_progress", { position: { ...fix, latitude: 37.559 }, locale: "ko" });
    nav.event("reroute", { position: fix });
    nav.event("arrive", { position: fix });
    nav.event("nav_progress", { position: fix });
    expect(send).toHaveBeenCalledTimes(4);
    expect(send.mock.calls.map((call) => call[1].navigationId)).toEqual([firstId, firstId, firstId, firstId]);
    expect(send.mock.calls.every((call) => call[1].geoConsent === true && call[1].position !== null)).toBe(true);
  });

  it("withdrawal stops future coordinates without disabling navigation", () => {
    const send = vi.fn(), nav = createNavigationAnalytics(send);
    nav.begin("worldcup-market-01");
    setNavGeoConsent("yes");
    nav.event("nav_progress", { position: fix });
    setNavGeoConsent("no");
    nav.event("nav_progress", { position: fix });
    expect(send.mock.calls[0]![1]).toMatchObject({ position: fix, geoConsent: true });
    expect(send.mock.calls[1]![1]).toMatchObject({ position: null, geoConsent: false });
  });

  it("starts a separate attempt at another store and ignores missing store ID", () => {
    const send = vi.fn(), nav = createNavigationAnalytics(send);
    nav.begin(null);
    nav.event("nav_start", { position: fix });
    expect(send).not.toHaveBeenCalled();
    nav.begin("worldcup-market-23");
    nav.event("nav_start", { position: fix });
    nav.stop();
    nav.event("nav_progress", { position: fix });
    nav.begin("worldcup-market-05");
    nav.event("nav_start", { position: fix });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![1].navigationId).toBe(firstId);
    expect(send.mock.calls[1]![1].navigationId).toBe(secondId);
    expect(send.mock.calls[1]![1].storeId).toBe("worldcup-market-05");
  });
});
