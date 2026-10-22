// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RouteModel } from "@walk/route-engine";
import MapView from "./MapView";

interface FakeMap {
  canvas: HTMLCanvasElement;
  surface: HTMLDivElement;
  emit(event: string): void;
  easeTo: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}
interface FakeMarker {
  setLngLat: ReturnType<typeof vi.fn>;
}
const fake = vi.hoisted(() => ({
  maps: [] as FakeMap[],
  markers: [] as FakeMarker[],
}));

vi.mock("maplibre-gl", () => {
  class Map {
    canvas = document.createElement("canvas");
    surface = document.createElement("div");
    listeners = new globalThis.Map<string, () => void>();
    easeTo = vi.fn();
    fitBounds = vi.fn();
    stop = vi.fn();
    remove = vi.fn();
    setStyle = vi.fn();
    addSource = vi.fn();
    addLayer = vi.fn();
    source = { setData: vi.fn() };
    constructor() { this.surface.appendChild(this.canvas); fake.maps.push(this); }
    getCanvas() { return this.canvas; }
    getContainer() { return this.surface; }
    isStyleLoaded() { return true; }
    getSource() { return this.source; }
    on(event: string, handler: () => void) { this.listeners.set(event, handler); }
    off(event: string, handler: () => void) {
      if (this.listeners.get(event) === handler) this.listeners.delete(event);
    }
    emit(event: string) { this.listeners.get(event)?.(); }
  }
  class Marker {
    setLngLat = vi.fn(() => this);
    setRotation = vi.fn(() => this);
    addTo = vi.fn(() => this);
    remove = vi.fn();
    constructor() { fake.markers.push(this); }
  }
  class LngLatBounds {
    extend() { return this; }
  }
  return { default: { Map, Marker, LngLatBounds } };
});

const A = { latitude: 37.5665, longitude: 126.978 };
const B = { latitude: 37.568, longitude: 126.98 };
const C = { latitude: 37.57, longitude: 126.982 };
const route: RouteModel = { polyline: [A, B], turnPoints: [] };
const reroute: RouteModel = { polyline: [B, C], turnPoints: [] };
const props = {
  route,
  here: A,
  viewHeadingDegrees: null,
  movementHeadingDegrees: null,
  headingUp: false,
  offRoute: false,
};

beforeEach(() => {
  fake.maps.length = 0;
  fake.markers.length = 0;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function loadedMap() {
  const map = fake.maps[0]!;
  act(() => map.emit("load"));
  return map;
}

describe("MapView manual camera control", () => {
  it("stops GPS camera-follow at first touch, but continues updating the position marker", () => {
    const view = render(<MapView {...props} />);
    const map = loadedMap();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.easeTo).toHaveBeenCalledTimes(1);

    // dragstart 이전의 최초 터치도 카메라를 고정해야 한다.
    fireEvent.pointerDown(map.canvas);
    expect(map.stop).toHaveBeenCalledTimes(1);
    view.rerender(<MapView {...props} here={B} viewHeadingDegrees={50} />);
    expect(map.easeTo).toHaveBeenCalledTimes(1);
    expect(fake.markers[0]?.setLngLat).toHaveBeenLastCalledWith([B.longitude, B.latitude]);

    // 자동 재탐색은 내 위치를 계속 갱신하지만 사용자가 옮긴 지도를 되돌리지 않는다.
    view.rerender(<MapView {...props} route={reroute} here={C} viewHeadingDegrees={90} />);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.easeTo).toHaveBeenCalledTimes(1);
    expect(fake.markers[0]?.setLngLat).toHaveBeenLastCalledWith([C.longitude, C.latitude]);

    // 타일 폴백 등으로 load 이벤트가 다시 와도 시점을 다시 맞추지 않는다.
    act(() => map.emit("load"));
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("resumes GPS camera-follow only after the existing 내 위치 button is clicked", () => {
    const view = render(<MapView {...props} />);
    const map = loadedMap();
    fireEvent.wheel(map.canvas);
    view.rerender(<MapView {...props} here={B} />);
    expect(map.easeTo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "내 위치" }));
    expect(map.easeTo).toHaveBeenCalledTimes(2);
    expect(map.easeTo).toHaveBeenLastCalledWith({
      center: [B.longitude, B.latitude],
      zoom: 17,
      duration: 400,
    });

    view.rerender(<MapView {...props} here={C} />);
    expect(map.easeTo).toHaveBeenCalledTimes(3);
  });
});
