// @vitest-environment jsdom
/**
 * 목적지 검색/선택과 실시간 GPS 내비게이션의 lifecycle 분리를 고정하는 회귀테스트.
 *
 *   TEST A — 목적지 선택은 어떤 geolocation API 도 부르지 않는다.
 *   TEST B — '걷기' 클릭에서만 1회 위치 조회, 성공해야만 navigating 진입.
 *   TEST C — navigating 중 GPS 틱은 엔진에 반영되고 검색 상태는 건드리지 않는다.
 *   TEST D — '안내 중지'는 워처를 반드시 해제한다.
 *
 * MapView 는 maplibre-gl(WebGL)을 직접 만져 jsdom 에서 돌릴 수 없다 — lifecycle/wiring
 * 테스트와는 무관하므로 next/dynamic 자체를 mock 해 우회한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const mockGetCurrentPosition = vi.fn();
const mockWatchPosition = vi.fn();
const mockClearWatch = vi.fn();

function installGeolocationMock() {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: mockGetCurrentPosition,
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
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/places")) {
      return new Response(
        JSON.stringify({ hits: [{ name: "경복궁", coordinate: DEST_COORD }], hint: null }),
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

describe("TEST A — 목적지 선택은 어떤 geolocation API 도 부르지 않는다", () => {
  it("검색 → 선택 → 시간이 흘러도 watchPosition/getCurrentPosition 이 호출되지 않는다", async () => {
    await pickDestination();

    expect(mockWatchPosition).not.toHaveBeenCalled();
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    expect(placesCallCount()).toBe(1);

    // 실제 GPS 구독 자체가 없으니 "주입"할 콜백이 없다 — 걸었다면 GPS 20틱쯤
    // 지났을 시간을 흘려보내며 아무 것도 안 바뀌는지 확인한다.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(mockWatchPosition).not.toHaveBeenCalled();
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    expect(placesCallCount()).toBe(1);

    const input = screen.getByLabelText("목적지") as HTMLInputElement;
    expect(input.value).toBe("경복궁");
    expect(screen.queryByRole("button", { name: /경복궁/ })).toBeNull(); // 결과 목록이 다시 뜨지 않는다
    expect(screen.queryByText("검색 중…")).toBeNull();
    expect(screen.queryByText("현재 위치 확인 중…")).toBeNull();
    expect(document.querySelector(".error")).toBeNull();
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
      watch.success?.(position(point, 1000 + i * 500));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => {});
    }

    expect(placesCallCount()).toBe(placesBefore);
    await waitFor(() => expect(screen.getByText(/남은 거리/)).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("map-view").getAttribute("data-movement-heading")).not.toBe("null"));
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
    watch.success?.(position(moveCoordinateByMeters(ORIGIN, 2, 0), 2_000));

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
