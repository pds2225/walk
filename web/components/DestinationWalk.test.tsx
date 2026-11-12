// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DestinationWalk from "./DestinationWalk";

vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="walking-map" /> }));
vi.mock("./RoadviewViewer", () => ({ default: () => null }));
vi.mock("../lib/useNavigation", () => ({
  useNavigation: () => ({
    arrived: false, state: "on_route", result: null, sampleCount: 0, elapsedSinceStartMs: 0,
    banner: "Walking", remainingMeters: 120, nextTurn: null, movementHeadingDegrees: null,
  }),
}));

const A = { latitude: 37.5587, longitude: 126.905 };
const B = { latitude: 37.5589, longitude: 126.9052 };
const target = { name: "Test shop", coordinate: B };
let success: PositionCallback;
let failure: PositionErrorCallback;
let get: ReturnType<typeof vi.fn>;
let watch: ReturnType<typeof vi.fn>;
let clear: ReturnType<typeof vi.fn>;
let request: ReturnType<typeof vi.fn>;
const position = {
  coords: { ...A, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
  timestamp: Date.now(),
} as GeolocationPosition;

beforeEach(() => {
  get = vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => { success = ok; failure = fail; });
  watch = vi.fn(() => 42);
  clear = vi.fn();
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: get, watchPosition: watch, clearWatch: clear } });
  request = vi.fn();
  vi.stubGlobal("fetch", request);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("market walking location lifecycle", () => {
  it("takes one fix, waits for the selected destination route, then tracks only until stopped", async () => {
    let finishRoute!: (response: Response) => void;
    request.mockImplementation(() => new Promise<Response>((resolve) => { finishRoute = resolve; }));
    function Session() {
      const [active, setActive] = useState(true);
      return active ? <DestinationWalk locale="en" onLocaleChange={vi.fn()} target={target} onStop={() => setActive(false)} /> : <p>Stopped</p>;
    }
    render(<Session />);
    expect(get).toHaveBeenCalledTimes(1);
    expect(watch).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    await act(async () => success(position));
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe("/api/route");
    expect(JSON.parse(init.body)).toMatchObject({ origin: A, dest: B });
    expect(watch).not.toHaveBeenCalled();
    await act(async () => finishRoute(new Response(JSON.stringify({ route: { polyline: [A, B], turnPoints: [] }, totalDistanceMeters: 180, totalSeconds: 180 }), { status: 200 })));
    await waitFor(() => expect(screen.getByTestId("walking-map")).toBeTruthy());
    expect(watch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("timer").textContent).toContain("Estimated walk: about 3 min");
    expect(screen.getByRole("timer").textContent).toContain("Walking elapsed: 0:00");
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(screen.getByText("Stopped")).toBeTruthy();
    expect(clear).toHaveBeenCalledWith(42);
  });

  it("does not request a route or start tracking after location permission is denied", async () => {
    render(<DestinationWalk locale="en" onLocaleChange={vi.fn()} target={target} onStop={vi.fn()} />);
    await act(async () => failure({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "denied" } as GeolocationPositionError));
    expect(request).not.toHaveBeenCalled();
    expect(watch).not.toHaveBeenCalled();
    expect(screen.queryByTestId("walking-map")).toBeNull();
  });

  it("does not start tracking if route retrieval fails", async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ error: "Route unavailable" }), { status: 503 }));
    render(<DestinationWalk locale="en" onLocaleChange={vi.fn()} target={target} onStop={vi.fn()} />);
    await act(async () => success(position));
    expect(await screen.findByText("Route unavailable")).toBeTruthy();
    expect(watch).not.toHaveBeenCalled();
  });

  it("ignores a pending fix after the walking screen is closed", async () => {
    const view = render(<DestinationWalk locale="en" onLocaleChange={vi.fn()} target={target} onStop={vi.fn()} />);
    view.unmount();
    await act(async () => success(position));
    expect(request).not.toHaveBeenCalled();
    expect(watch).not.toHaveBeenCalled();
  });
});
