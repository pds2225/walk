// @vitest-environment jsdom
/**
 * 목적지 검색/선택과 실시간 GPS 내비게이션의 lifecycle 분리를 고정하는 회귀테스트.
 *
 *   TEST A — 검색은 단발 위치(getCurrentPosition, 저정확도) 1회만 받아 lat/lon 으로 보낸다.
 *            검색·선택은 watchPosition(연속 추적)을 절대 시작하지 않는다 — 안내 중에만.
 *            (옛 규칙 「검색은 GPS를 절대 안 부른다」는 폐기: 좌표 없는 검색이 전 지역에서
 *             서울 도심·시청 부근으로 편향되던 원인이었다.)
 *   TEST B — '걷기' 클릭에서만 1회 위치 조회, 성공해야만 navigating 진입.
 *   TEST C — navigating 중 GPS 틱은 엔진에 반영되고 검색 상태는 건드리지 않는다.
 *   TEST D — '안내 중지'는 워처를 반드시 해제한다.
 *
 * MapView 는 maplibre-gl(WebGL)을 직접 만져 jsdom 에서 돌릴 수 없다 — lifecycle/wiring
 * 테스트와는 무관하므로 next/dynamic 자체를 mock 해 우회한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { moveCoordinateByMeters } from "@walk/route-engine";
import type { Coordinate, RouteModel } from "@walk/route-engine";
import Home from "./page";

vi.mock("next/dynamic", () => ({
  default: () => {
    function MockMapView(props: {
      viewHeadingDegrees?: number | null;
      movementHeadingDegrees?: number | null;
    }) {
      return (
        <div
          data-testid="map-view"
          data-view-heading={props.viewHeadingDegrees ?? "null"}
          data-movement-heading={props.movementHeadingDegrees ?? "null"}
        />
      );
    }
    return MockMapView;
  },
}));

type SuccessCb = (pos: GeolocationPosition) => void;
type ErrorCb = (err: GeolocationPositionError) => void;

const ORIGIN: Coordinate = { latitude: 37.5665, longitude: 126.978 };
const DEST_COORD = moveCoordinateByMeters(ORIGIN, 200, 0);
const MANUAL_ORIGIN = moveCoordinateByMeters(ORIGIN, 350, 0);
const ROUTE: RouteModel = { polyline: [ORIGIN, DEST_COORD], turnPoints: [] };
const REROUTE_START = moveCoordinateByMeters(ORIGIN, 50, 90);
const REROUTED_ROUTE: RouteModel = {
  polyline: [REROUTE_START, moveCoordinateByMeters(REROUTE_START, 150, 0), DEST_COORD],
  turnPoints: [],
};
const ROADVIEW_ROUTE: RouteModel = {
  polyline: [ORIGIN, moveCoordinateByMeters(ORIGIN, 40, 0)],
  turnPoints: [],
};

/** 안내용(고정확도) 단발 조회. 검색 기준 조회는 mockSearchCenter 로 따로 센다. */
const mockGetCurrentPosition = vi.fn();
/** 검색 기준 좌표용 단발 조회(enableHighAccuracy:false). 기본은 여의도에서 성공. */
const mockSearchCenter = vi.fn();
const YEOUIDO: Coordinate = { latitude: 37.5219, longitude: 126.9245 };
const mockWatchPosition = vi.fn();
const mockClearWatch = vi.fn();

function installGeolocationMock() {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback, err?: PositionErrorCallback | null, opts?: PositionOptions) =>
        opts?.enableHighAccuracy === false ? mockSearchCenter(ok, err, opts) : mockGetCurrentPosition(ok, err, opts),
      watchPosition: mockWatchPosition,
      clearWatch: mockClearWatch,
    },
  });
}

function position(coord: Coordinate, timestampMs: number, accuracy = 5): GeolocationPosition {
  return {
    coords: {
      latitude: coord.latitude,
      longitude: coord.longitude,
      accuracy,
      heading: null,
      speed: null,
      altitude: null,
      altitudeAccuracy: null,
    },
    timestamp: timestampMs,
  } as GeolocationPosition;
}

let fetchMock: ReturnType<typeof vi.fn>;
let routeResponses: RouteModel[];
let routeResponseIndex: number;
let rerouteGate: Promise<void> | null;
let releaseReroute: (() => void) | null;

function placesCallCount() {
  return fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/places")).length;
}

function routeCallCount() {
  return fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/route")).length;
}

function installFetchMock() {
  fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/places")) {
      return new Response(
        JSON.stringify({ hits: [url.includes(encodeURIComponent("서울역"))
          ? { name: "서울역", coordinate: MANUAL_ORIGIN }
          : { name: "경복궁", coordinate: DEST_COORD }], hint: null }),
        { status: 200 },
      );
    }
    if (url.startsWith("/api/route")) {
      const responseIndex = routeResponseIndex++;
      const route = routeResponses[Math.min(responseIndex, routeResponses.length - 1)] ?? ROUTE;
      if (responseIndex === 1 && rerouteGate) await rerouteGate;
      return new Response(
        JSON.stringify({
          route,
          totalDistanceMeters: 200,
          totalSeconds: 160,
          turnDescriptions: {},
          source: "tmap",
        }),
        { status: 200 },
      );
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => {
  // '최근 목적지'는 localStorage 에 저장된다 — jsdom 의 window 는 테스트 파일
  // 안에서 재사용되므로, 비우지 않으면 이전 테스트의 '경복궁'이 다음 테스트의
  // 최근 목적지 칩으로 남아 검색 결과 버튼과 이름이 겹친다.
  window.localStorage.clear();
  mockGetCurrentPosition.mockReset();
  mockSearchCenter.mockReset();
  mockSearchCenter.mockImplementation((ok: SuccessCb) => ok(position(YEOUIDO, 500, 50)));
  mockWatchPosition.mockReset();
  mockClearWatch.mockReset();
  routeResponses = [ROUTE];
  routeResponseIndex = 0;
  rerouteGate = null;
  releaseReroute = null;
  installGeolocationMock();
  installFetchMock();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function pickDestination() {
  render(<Home />);
  fireEvent.change(screen.getByLabelText("목적지"), { target: { value: "경복궁" } });
  // 검색 결과(.hits)로 범위를 좁힌다 — '최근 목적지' 칩도 같은 이름일 수 있고,
  // 칩을 클릭하면 pick() 이 아니라 startWalking() 이 바로 불려 다른 경로를 탄다.
  const hitsList = await screen.findByRole("list");
  const hit = within(hitsList).getByRole("button", { name: /경복궁/ });
  fireEvent.click(hit);
}

describe("진도식당 동명 장소 검색 표시", () => {
  it("안내용 GPS 없이 서로 다른 주소 2개를 표시하며 가짜 13,000km 거리는 표시하지 않는다", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/places")) {
        return new Response(JSON.stringify({ hits: [
          { name: "진도식당", address: "서울 마포구 월드컵로 1", coordinate: DEST_COORD },
          { name: "진도식당", address: "서울 영등포구 여의대로 2", coordinate: MANUAL_ORIGIN },
        ], hint: null }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    render(<Home />);
    fireEvent.change(screen.getByRole("searchbox", { name: "목적지" }), { target: { value: "진도식당" } });
    const results = await screen.findByRole("list");
    expect(within(results).getAllByRole("button")).toHaveLength(2);
    expect(within(results).getByText("서울 마포구 월드컵로 1")).toBeTruthy();
    expect(within(results).getByText("서울 영등포구 여의대로 2")).toBeTruthy();
    expect(within(results).queryByText(/13,000|13000|km/)).toBeNull();
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    expect(mockWatchPosition).not.toHaveBeenCalled();
    // 좌표 없는(시청 편향) 검색은 한 번도 나가지 않는다.
    const placeUrls = fetchMock.mock.calls.map(([url]) => String(url)).filter((u) => u.startsWith("/api/places"));
    expect(placeUrls.length).toBeGreaterThan(0);
    expect(placeUrls.every((u) => u.includes("&lat=") && u.includes("&lon="))).toBe(true);
  });

  it("주소가 없는 후보를 확인 가능하도록 주소 미제공으로 표시한다", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/places")) {
        return new Response(JSON.stringify({ hits: [
          { name: "진도식당", coordinate: DEST_COORD },
        ], hint: null }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    render(<Home />);
    fireEvent.change(screen.getByRole("searchbox", { name: "목적지" }), { target: { value: "진도식당" } });
    expect(await screen.findByText("주소 정보 미제공")).toBeTruthy();
  });
});

describe("TEST A — 검색은 단발 위치로 기준을 잡고, 연속 추적은 시작하지 않는다", () => {
  it("검색 → 선택 → 시간이 흘러도 watchPosition 은 없고, 검색 기준 단발 조회는 1회뿐이다", async () => {
    await pickDestination();

    expect(mockWatchPosition).not.toHaveBeenCalled();
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    expect(mockSearchCenter).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.startsWith("/api/places"))!;
    expect(url).toContain(`lat=${YEOUIDO.latitude}`);
    expect(url).toContain(`lon=${YEOUIDO.longitude}`);
    const placesAfterPick = placesCallCount();

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(mockWatchPosition).not.toHaveBeenCalled();
    expect(mockSearchCenter).toHaveBeenCalledTimes(1);
    expect(placesCallCount()).toBe(placesAfterPick);

    const input = screen.getByLabelText("목적지") as HTMLInputElement;
    expect(input.value).toBe("경복궁");
    expect(screen.queryByRole("button", { name: /경복궁/ })).toBeNull();
    expect(screen.queryByText("검색 중…")).toBeNull();
    expect(document.querySelector(".error")).toBeNull();
  });

  it.each([
    ["여의도", { latitude: 37.5219, longitude: 126.9245 }],
    ["합정", { latitude: 37.5496, longitude: 126.9139 }],
    ["강남", { latitude: 37.4979, longitude: 127.0276 }],
    ["부산 서면", { latitude: 35.1577, longitude: 129.0596 }],
  ])("%s 에서 검색하면 그 지역 좌표가 기준으로 간다 (시청 고정 아님)", async (_area, at) => {
    mockSearchCenter.mockImplementation((ok: SuccessCb) => ok(position(at, 500, 80)));
    render(<Home />);
    fireEvent.change(screen.getByLabelText("목적지"), { target: { value: "서울 영등포구 여의대로 2" } });
    await waitFor(() => expect(placesCallCount()).toBeGreaterThan(0));
    const url = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.startsWith("/api/places"))!;
    expect(url).toContain(`lat=${at.latitude}`);
    expect(url).toContain(`lon=${at.longitude}`);
    expect(mockWatchPosition).not.toHaveBeenCalled();
  });

  it("위치 권한 거부 시 좌표 없이 검색하되 '가까운 순 아님' 안내를 띄운다", async () => {
    mockSearchCenter.mockImplementation((_ok: SuccessCb, err: ErrorCb) => err({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError));
    render(<Home />);
    fireEvent.change(screen.getByLabelText("목적지"), { target: { value: "경복궁" } });
    expect(await screen.findByText(/가까운 순이 아닐 수 있어요/)).toBeTruthy();
    await waitFor(() => expect(placesCallCount()).toBeGreaterThan(0));
    expect(mockWatchPosition).not.toHaveBeenCalled();
  });

  it("검색 기준이 만료되고 위치 권한이 거부되어도 실패 후 무한 재요청하지 않는다", async () => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    render(<Home />);
    fireEvent.change(screen.getByLabelText("목적지"), { target: { value: "진도식당" } });
    await waitFor(() => expect(mockSearchCenter).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(placesCallCount()).toBeGreaterThan(0));

    // 정상으로 얻은 중심 좌표가 2분 경과한 직후 권한이 철회됨.
    now += 121_000;
    mockSearchCenter.mockImplementation((_ok: SuccessCb, err: ErrorCb) =>
      err({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError));
    fireEvent.change(screen.getByLabelText("목적지"), { target: { value: "진도식당 서울" } });
    await waitFor(() => expect(mockSearchCenter).toHaveBeenCalledTimes(2));

    // 실패 상태로 재렌더되거나 출발지 검색을 열어도 동일한 단발 조회를 반복하지 않는다.
    fireEvent.click(screen.getByRole("button", { name: /출발지 변경|출발지/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: /출발지/ }), { target: { value: "서울역" } });
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(mockSearchCenter).toHaveBeenCalledTimes(2);
    expect(mockWatchPosition).not.toHaveBeenCalled();
  });

  it("주소 지오코딩 결과(name=address)는 빈 줄 없이 '주소 검색 결과'로 일관 표시한다", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/places")) {
        return new Response(JSON.stringify({ hits: [
          { name: "서울 영등포구 여의도동 1", address: "서울 영등포구 여의도동 1", coordinate: DEST_COORD },
        ], hint: null }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    render(<Home />);
    fireEvent.change(screen.getByLabelText("목적지"), { target: { value: "여의도동 1" } });
    expect(await screen.findByText("주소 검색 결과")).toBeTruthy();
  });
});

describe("TEST I — 출발지 변경은 숨겨진 보조 기능이며 수동 위치는 미리보기 전용", () => {
  it("수동 출발지 경로를 찾지만 GPS 조회와 실시간 추적은 하지 않는다", async () => {
    await pickDestination();
    expect(screen.queryByRole("searchbox", { name: "출발지" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /출발지 변경/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "출발지" }), { target: { value: "서울역" } });
    const list = await screen.findByRole("list", { name: "출발지" });
    fireEvent.click(within(list).getByRole("button", { name: /서울역/ }));

    expect(screen.queryByRole("searchbox", { name: "출발지" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "경로 미리보기" }));
    await waitFor(() => expect(screen.getByText(/지정한 출발지의 경로입니다/)).toBeTruthy());

    const call = fetchMock.mock.calls.find((item) => String(item[0]) === "/api/route");
    expect(call).toBeDefined();
    const payload = JSON.parse(String(call?.[1]?.body)) as { origin: Coordinate; dest: Coordinate };
    expect(payload.origin).toEqual(MANUAL_ORIGIN);
    expect(payload.dest).toEqual(DEST_COORD);
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    expect(mockWatchPosition).not.toHaveBeenCalled();
    expect(screen.getByTestId("map-view")).toBeTruthy();
  });

  it("미리보기에서 현재 위치 안내 시작 시 GPS로 다시 경로를 계산한다", async () => {
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => success(position(ORIGIN, 1000)));
    mockWatchPosition.mockImplementation(() => 42);
    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: /출발지 변경/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "출발지" }), { target: { value: "서울역" } });
    fireEvent.click(within(await screen.findByRole("list", { name: "출발지" })).getByRole("button", { name: /서울역/ }));
    fireEvent.click(screen.getByRole("button", { name: "경로 미리보기" }));
    await screen.findByText(/지정한 출발지의 경로입니다/);
    fireEvent.click(screen.getByRole("button", { name: "현재 위치에서 안내 시작" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "안내 중지" })).toBeTruthy());

    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    expect(routeCallCount()).toBe(2);
    const calls = fetchMock.mock.calls.filter((item) => String(item[0]) === "/api/route");
    const payload = JSON.parse(String(calls[1]?.[1]?.body)) as { origin: Coordinate };
    expect(payload.origin.latitude).toBe(ORIGIN.latitude);
    expect(payload.origin.longitude).toBe(ORIGIN.longitude);
  });
});

describe("TEST H — 언어 전환은 실제 화면의 향후 안내에 적용된다", () => {
  it("홈 화면의 주 언어를 영어로 바꾸면 목적지 UI도 즉시 바뀐다", () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText("언어"), { target: { value: "en" } });

    expect(screen.getByText("Where are you going?")).toBeTruthy();
    expect(screen.getByLabelText("Destination")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start walking" })).toBeTruthy();
  });
});

describe("TEST B — '걷기' 클릭에서만 원샷 위치 조회, 성공해야만 navigating 진입", () => {
  it("route API 는 정확히 1회 호출되고, 그 이후에만 watchPosition 이 시작된다", async () => {
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => {
      success(position(ORIGIN, 1000));
    });
    mockWatchPosition.mockImplementation(() => 42);

    await pickDestination();
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    expect(mockWatchPosition).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "걷기" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "안내 중지" })).toBeTruthy());

    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
    expect(routeCallCount()).toBe(1);
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
  });

  it("iOS 나침반 권한은 위치 조회보다 먼저 사용자 제스처 안에서 요청한다", async () => {
    const order: string[] = [];
    const requestPermission = vi.fn(() => {
      order.push("compass");
      return Promise.resolve("granted");
    });
    Object.defineProperty(window, "DeviceOrientationEvent", {
      configurable: true,
      value: { requestPermission },
    });
    mockGetCurrentPosition.mockImplementation(() => {
      order.push("location");
    });

    try {
      await pickDestination();
      fireEvent.click(screen.getByRole("button", { name: "걷기" }));

      await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
      expect(order.slice(0, 2)).toEqual(["compass", "location"]);
    } finally {
      delete (window as unknown as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent;
    }
  });

  it("원샷 위치 조회가 실패하면 route API 를 부르지 않고 목적지 선택 화면에 남는다", async () => {
    mockGetCurrentPosition.mockImplementation((_success: SuccessCb, error: ErrorCb) => {
      error({
        code: 2,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: "unavailable",
      } as GeolocationPositionError);
    });

    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));

    await waitFor(() => expect(document.querySelector(".error")).not.toBeNull());

    expect(routeCallCount()).toBe(0);
    expect(mockWatchPosition).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "걷기" })).toBeTruthy();
  });

  it("원샷 위치 정확도가 50m를 넘으면 route API 를 부르지 않는다", async () => {
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => {
      success(position(ORIGIN, 1000, 50.1));
    });

    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));

    await waitFor(() => expect(screen.queryByText(/정확도가 낮습니다/)).not.toBeNull());
    expect(routeCallCount()).toBe(0);
    expect(mockWatchPosition).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "걷기" })).toBeTruthy();
  });
});

describe("TEST C — navigating 중 GPS 틱은 엔진에 반영되고 검색 상태는 건드리지 않는다", () => {
  it("~20개의 fix 를 흘려도 /api/places 재호출이 없고, 내비게이션 엔진이 갱신된다", async () => {
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => success(position(ORIGIN, 1000)));
    const watch: { success: SuccessCb | null } = { success: null };
    mockWatchPosition.mockImplementation((success: SuccessCb) => {
      watch.success = success;
      return 42;
    });

    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));

    const placesBefore = placesCallCount();

    for (let i = 1; i <= 20; i++) {
      const point = moveCoordinateByMeters(ORIGIN, i * 2, 0); // 경로를 따라 2m씩 전진 (총 40m, 도착 반경 20m 밖)
      watch.success?.(position(point, 1000 + i * 1_000)); // 보행 속도 2m/s
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => {});
    }

    expect(placesCallCount()).toBe(placesBefore);
    await waitFor(() => expect(screen.getByText(/남은 거리/)).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("map-view").getAttribute("data-movement-heading")).not.toBe("null"));
  });
});


describe("TEST J — GPS 진단 통합 경로: 필터 거부와 회복", () => {
  it("50m 초과 fix는 안내와 진단값 모두 유지하고 오류 표시만 갱신하며 회복 후 다시 누적한다", async () => {
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => success(position(ORIGIN, 1000, 5)));
    const watch: { success: SuccessCb | null } = { success: null };
    mockWatchPosition.mockImplementation((success: SuccessCb) => { watch.success = success; return 42; });

    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));
    const details = document.querySelector(".gps-diagnostics");
    expect(details).not.toBeNull();
    fireEvent.click(details!.querySelector("summary")!);
    await waitFor(() => expect(screen.getByText("GPS 필터 통과 표본 수")).toBeTruthy());
    await act(async () => { watch.success?.(position(moveCoordinateByMeters(ORIGIN, 2, 0), 2000, 10)); });
    await waitFor(() => expect(screen.getByText("±10m")).toBeTruthy());

    const routeCalls = routeCallCount();
    await act(async () => { watch.success?.(position(moveCoordinateByMeters(ORIGIN, 120, 0), 3000, 100)); });
    await waitFor(() => expect(screen.getByText("GPS 상태 · 불안정")).toBeTruthy());
    expect(screen.getByText("확인 불가 (새 위치 반영 안 됨)")).toBeTruthy();
    expect(screen.getByText("±10m")).toBeTruthy();
    expect(routeCallCount()).toBe(routeCalls);
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);

    await act(async () => { watch.success?.(position(moveCoordinateByMeters(ORIGIN, 3, 0), 4000, 8)); });
    await waitFor(() => expect(screen.getByText("GPS 상태 · 좋음")).toBeTruthy());
    expect(screen.getByText("±8m")).toBeTruthy();
    expect(screen.queryByText("확인 불가 (새 위치 반영 안 됨)")).toBeNull();
    expect(routeCallCount()).toBe(routeCalls);
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
  });
});

describe("TEST G — 사용자 시야방향과 GPS 이동방향은 별도 데이터다", () => {
  it("지도 회전은 나침반을 사용하고 경로 표시는 GPS 이동방향을 유지한다", async () => {
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => success(position(ORIGIN, 1000)));
    const watch: { success: SuccessCb | null } = { success: null };
    mockWatchPosition.mockImplementation((success: SuccessCb) => {
      watch.success = success;
      return 42;
    });

    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));

    const orientation = new Event("deviceorientationabsolute");
    Object.defineProperty(orientation, "alpha", { value: 90 });
    window.dispatchEvent(orientation);
    watch.success?.(position(moveCoordinateByMeters(ORIGIN, 10, 0), 10_000)); // 1.1m/s 보행으로 course 신뢰도 확보

    await waitFor(() => expect(screen.getByText("내가 보는 방향 270°")).toBeTruthy());
    expect(screen.getByTestId("map-view").getAttribute("data-view-heading")).toBe("270");
    await waitFor(() => expect(screen.getByTestId("map-view").getAttribute("data-movement-heading")).not.toBe("null"));
    expect(screen.getByTestId("map-view").getAttribute("data-movement-heading")).not.toBe("270");
  });
});

describe("TEST D — 안내 중지는 워처를 반드시 해제한다", () => {
  it("clearWatch 가 호출되고, 그 뒤의 stale GPS 콜백은 화면에 반영되지 않는다", async () => {
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => success(position(ORIGIN, 1000)));
    const watch: { success: SuccessCb | null } = { success: null };
    mockWatchPosition.mockImplementation((success: SuccessCb) => {
      watch.success = success;
      return 42;
    });

    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "안내 중지" }));

    expect(mockClearWatch).toHaveBeenCalledWith(42);
    await waitFor(() => expect(screen.getByText("어디로 갈까요?")).toBeTruthy());

    // clearWatch 이후 늦게 도착한("stale") 콜백을 흉내내도 nav 화면으로 돌아가지 않는다.
    watch.success?.(position(moveCoordinateByMeters(ORIGIN, 50, 0), 9999));
    expect(screen.queryByRole("button", { name: "안내 중지" })).toBeNull();
    expect(screen.getByText("어디로 갈까요?")).toBeTruthy();
  });
});

describe("TEST E — 확정 이탈은 active route 를 실제로 재탐색한다", () => {
  it.each([25, 40])("회전 미이행 accuracy %sm의 보정 상태에 맞춰 화면/재탐색을 처리한다", async (accuracy) => {
    const turn = moveCoordinateByMeters(ORIGIN, 40, 0);
    const turnRoute: RouteModel = {
      polyline: [ORIGIN, turn, moveCoordinateByMeters(ORIGIN, 40, 100)],
      turnPoints: [{ id: "left-1", coordinate: turn, routeIndex: 1, direction: "left" }],
    };
    routeResponses = [turnRoute, REROUTED_ROUTE];
    rerouteGate = new Promise<void>((resolve) => { releaseReroute = resolve; });
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => success(position(ORIGIN, 1_000)));
    const watch: { success: SuccessCb | null } = { success: null };
    mockWatchPosition.mockImplementation((success: SuccessCb) => { watch.success = success; return 42; });

    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));
    const eastMeters = [3, 10, 20, 32, 52];
    for (const [i, east] of eastMeters.entries()) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { watch.success?.(position(moveCoordinateByMeters(ORIGIN, east, 0), 1_000 + (i + 1) * 8_000, accuracy)); });
    }

    expect(routeCallCount()).toBe(accuracy === 25 ? 2 : 1);
    expect(document.querySelector(".banner-off") !== null).toBe(accuracy === 25);
    if (accuracy === 25) {
      expect(screen.getByText("경로를 다시 찾는 중…")).toBeTruthy();
      await act(async () => { releaseReroute?.(); });
      await waitFor(() => expect(screen.queryByText("경로를 다시 찾는 중…")).toBeNull());
      expect(screen.getByRole("button", { name: "안내 중지" })).toBeTruthy();
    } else {
      // 40m 오차에서는 확정 이탈·재탐색을 보류하되 회전 미이행 가능성은 drifting으로 유지한다.
      expect(screen.getByText("길에서 조금 벗어났어요")).toBeTruthy();
      expect(routeCallCount()).toBe(1);
      expect(document.querySelector(".banner-off")).toBeNull();
    }
  });

  it("GPS 오차 안의 횡거리 이탈은 raw reroute_candidate가 있어도 재탐색하지 않는다", async () => {
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => success(position(ORIGIN, 1_000)));
    const watch: { success: SuccessCb | null } = { success: null };
    mockWatchPosition.mockImplementation((success: SuccessCb) => { watch.success = success; return 42; });
    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));
    for (let i = 1; i <= 5; i++) {
      const point = moveCoordinateByMeters(ORIGIN, i * 2, 26);
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { watch.success?.(position(point, 1_000 + i * 8_000, 30)); });
    }
    expect(routeCallCount()).toBe(1);
    expect(document.querySelector(".banner-off")).toBeNull();
    expect(screen.getByText("길에서 조금 벗어났어요")).toBeTruthy();
  });

  it("reroute_candidate 한 번만 /api/route 를 추가 호출하고 새 경로를 설치한다", async () => {
    routeResponses = [ROUTE, REROUTED_ROUTE];
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => success(position(ORIGIN, 1000)));
    const watch: { success: SuccessCb | null } = { success: null };
    mockWatchPosition.mockImplementation((success: SuccessCb) => {
      watch.success = success;
      return 42;
    });

    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));

    // 경로에서 90m 벗어난 상태를 여러 번 유지한다. 시작 직후 5개 샘플
    // 또는 30초가 지나기 전에는 재탐색하지 않는다.
    for (let i = 1; i <= 5; i++) {
      const point = moveCoordinateByMeters(REROUTE_START, i * 2, 0);
      watch.success?.(position(point, 1000 + i * 8_000));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => {});
    }

    await waitFor(() => expect(routeCallCount()).toBe(2));
    expect(screen.queryByText("경로를 다시 찾는 중…")).toBeNull();
    expect(screen.queryByText(/재탐색에 실패했습니다/)).toBeNull();

    // 같은 active route에서 후속 GPS 틱이 와도 자동 재탐색을 반복하지 않는다.
    watch.success?.(position(moveCoordinateByMeters(REROUTE_START, 10, 0), 50_000));
    await waitFor(() => {});
    expect(routeCallCount()).toBe(2);
  });

  it("중지 후 늦게 도착한 reroute 응답은 새 안내 세션을 덮어쓰지 않는다", async () => {
    routeResponses = [ROUTE, REROUTED_ROUTE];
    rerouteGate = new Promise<void>((resolve) => {
      releaseReroute = resolve;
    });
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => success(position(ORIGIN, 1000)));
    const watch: { success: SuccessCb | null } = { success: null };
    mockWatchPosition.mockImplementation((success: SuccessCb) => {
      watch.success = success;
      return 42;
    });

    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));

    for (let i = 1; i <= 5; i++) {
      watch.success?.(position(moveCoordinateByMeters(REROUTE_START, i * 2, 0), 1000 + i * 8_000));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => {});
    }
    await waitFor(() => expect(routeCallCount()).toBe(2));

    fireEvent.click(screen.getByRole("button", { name: "안내 중지" }));
    releaseReroute?.();
    await waitFor(() => expect(screen.getByText("어디로 갈까요?")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "안내 중지" })).toBeNull();
  });

  it("도착 직후 늦게 도착한 reroute 응답은 도착 상태를 되돌리지 않는다", async () => {
    routeResponses = [ROUTE, REROUTED_ROUTE];
    rerouteGate = new Promise<void>((resolve) => {
      releaseReroute = resolve;
    });
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => success(position(ORIGIN, 1000)));
    const watch: { success: SuccessCb | null } = { success: null };
    mockWatchPosition.mockImplementation((success: SuccessCb) => {
      watch.success = success;
      return 42;
    });

    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));

    for (let i = 1; i <= 5; i++) {
      watch.success?.(position(moveCoordinateByMeters(REROUTE_START, i * 2, 0), 1000 + i * 8_000));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => {});
    }
    await waitFor(() => expect(routeCallCount()).toBe(2));

    watch.success?.(position(DEST_COORD, 50_000));
    await waitFor(() => expect(screen.getByText("목적지에 도착했습니다")).toBeTruthy());
    releaseReroute?.();
    await waitFor(() => expect(screen.getByText("목적지에 도착했습니다")).toBeTruthy());
  });

  it("정확도 35~50m인 이탈 후보는 reroute 근거로 사용하지 않는다", async () => {
    routeResponses = [ROUTE, REROUTED_ROUTE];
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => success(position(ORIGIN, 1000)));
    const watch: { success: SuccessCb | null } = { success: null };
    mockWatchPosition.mockImplementation((success: SuccessCb) => {
      watch.success = success;
      return 42;
    });

    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));

    for (let i = 1; i <= 5; i++) {
      watch.success?.(position(moveCoordinateByMeters(REROUTE_START, i * 2, 0), 1000 + i * 8_000, 40));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => {});
    }

    await waitFor(() => expect(routeCallCount()).toBe(1));
    expect(screen.queryByText("경로를 다시 찾는 중…")).toBeNull();
  });
});

describe("TEST F — 도착은 실시간 위치 안내를 종료한다", () => {
  it("목적지 반경에 들어오면 도착 화면을 유지하고 watcher 를 해제한다", async () => {
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => success(position(ORIGIN, 1000)));
    const watch: { success: SuccessCb | null } = { success: null };
    mockWatchPosition.mockImplementation((success: SuccessCb) => {
      watch.success = success;
      return 42;
    });

    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));

    // 정확도가 낮은 목적지 fix 는 도착을 확정하지 않는다.
    watch.success?.(position(DEST_COORD, 2_000, 40));
    await waitFor(() => expect(screen.queryByText("목적지에 도착했습니다")).toBeNull());
    expect(mockClearWatch).not.toHaveBeenCalled();

    watch.success?.(position(DEST_COORD, 3_000, 5));

    await waitFor(() => expect(screen.getByText("목적지에 도착했습니다")).toBeTruthy());
    await waitFor(() => expect(mockClearWatch).toHaveBeenCalledWith(42));
    expect(document.querySelector(".gps-diagnostics")).toBeNull(); // 도착 후 GPS 구독 종료: 진단값을 현재 상태로 노출하지 않음
    expect(screen.getByRole("button", { name: "안내 중지" })).toBeTruthy();
  });
});

describe("TEST I — 목적지 근처 Roadview 실패는 지도 안내를 중단하지 않는다", () => {
  it("50m 이내에서 Roadview를 열 수 없어도 fallback과 안내 중지 동작이 남는다", async () => {
    routeResponses = [ROADVIEW_ROUTE];
    mockGetCurrentPosition.mockImplementation((success: SuccessCb) => success(position(ORIGIN, 1000)));
    mockWatchPosition.mockImplementation(() => 42);

    await pickDestination();
    fireEvent.click(screen.getByRole("button", { name: "걷기" }));
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "목적지 주변 Roadview 보기" }));

    await waitFor(() => expect(screen.getByText(/Roadview를 사용할 수 없습니다/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "안내 중지" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "지도 안내로 돌아가기" })[0]!);
    expect(screen.getByRole("button", { name: "목적지 주변 Roadview 보기" })).toBeTruthy();
  });
});
