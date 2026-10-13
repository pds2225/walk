// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionId, track } from "./track";

afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear(); });

describe("track", () => {
  it("sends one beacon to /api/track with a stable session id and never throws", async () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
    track("store_view", { storeId: "worldcup-market-23", locale: "ja", src: "map" });
    track("phone_click", { storeId: "worldcup-market-23" });
    expect(beacon).toHaveBeenCalledTimes(2);
    expect(beacon.mock.calls[0]![0]).toBe("/api/track");
    const first = JSON.parse(await (beacon.mock.calls[0]![1] as Blob).text());
    const second = JSON.parse(await (beacon.mock.calls[1]![1] as Blob).text());
    expect(first).toMatchObject({ event: "store_view", store_id: "worldcup-market-23", locale: "ja", src: "map", path: "/" });
    expect(first.session_id).toBe(second.session_id);
    beacon.mockImplementation(() => { throw new Error("x"); });
    expect(() => track("page_view")).not.toThrow();
  });

  it("falls back to fetch keepalive", () => {
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: undefined });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    track("page_view");
    expect(fetchMock).toHaveBeenCalledWith("/api/track", expect.objectContaining({ method: "POST", keepalive: true }));
  });

  it("keeps one session id per tab and falls back to memory when storage is blocked", () => {
    const first = getSessionId();
    expect(getSessionId()).toBe(first);
    expect(window.sessionStorage.getItem("walk:session-id")).toBe(first);
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(getSessionId()).toBe(first);
    expect(getSessionId()).toBe(first);
    spy.mockRestore();
  });

  it("sends dwell_sec for store_leave", async () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
    track("store_leave", { storeId: "worldcup-market-23", dwellSec: 42 });
    expect(JSON.parse(await (beacon.mock.calls[0]![1] as Blob).text())).toMatchObject({ event: "store_leave", dwell_sec: 42 });
  });
});
