/**
 * TMAP 응답 → RouteModel 변환 검증.
 *
 * 이 로직은 파이썬 `route_builder._route_from_tmap_features` 와 같은 규칙이어야 한다.
 * 둘이 갈리면 같은 길에서 Streamlit 판과 웹 판의 회전 안내가 달라진다.
 */
import { describe, expect, it } from "vitest";
import { isSignificantTurn, routeFromFeatures } from "./tmap";
import type { Coordinate } from "@walk/route-engine";
import { moveCoordinateByMeters } from "@walk/route-engine";

const ORIGIN: Coordinate = { latitude: 37.5665, longitude: 126.978 };

/** ORIGIN 기준 동/북 오프셋(m) 좌표. */
function at(east: number, north: number): Coordinate {
  return moveCoordinateByMeters(ORIGIN, east, north);
}

function line(coords: readonly Coordinate[], props: Record<string, unknown> = {}) {
  return {
    geometry: { type: "LineString", coordinates: coords.map((c) => [c.longitude, c.latitude]) },
    properties: props,
  };
}

function point(turnType: number, description = "") {
  return { geometry: { type: "Point", coordinates: [0, 0] }, properties: { turnType, description } };
}

describe("routeFromFeatures", () => {
  it("LineString 을 이어 붙이고 총거리·소요시간을 뽑는다", () => {
    const result = routeFromFeatures([
      line([at(0, 0), at(30, 0)], { totalDistance: 260, totalTime: 240 }),
      line([at(30, 0), at(60, 0)]),
    ]);

    expect(result.route.polyline).toHaveLength(3);   // 경계 중복 좌표(30,0)는 1개로
    expect(result.totalDistanceMeters).toBe(260);
    expect(result.totalSeconds).toBe(240);
    expect(result.source).toBe("tmap");
  });

  it("좌/우회전 turnType 을 회전점으로 수집하고 안내문을 붙인다", () => {
    const result = routeFromFeatures([
      line([at(0, 0), at(40, 0)]),
      point(12, "횡단보도 건너 좌회전"),   // 12 = 좌회전
      line([at(40, 0), at(40, 40)]),
    ]);

    expect(result.route.turnPoints).toHaveLength(1);
    const turn = result.route.turnPoints[0]!;
    expect(turn.direction).toBe("left");
    expect(turn.routeIndex).toBe(1);
    expect(result.turnDescriptions[turn.id]).toBe("횡단보도 건너 좌회전");
  });

  it("우회전 코드(13/18/19)도 오른쪽으로 읽는다", () => {
    const result = routeFromFeatures([
      line([at(0, 0), at(40, 0)]),
      point(18),
      line([at(40, 0), at(40, -40)]),
    ]);

    expect(result.route.turnPoints[0]?.direction).toBe("right");
  });

  it("완만한 커브는 회전으로 안내하지 않는다", () => {
    // 40m 직진 뒤 약 14° 만 꺾이는 길 — 30° 임계 미만
    const result = routeFromFeatures([
      line([at(0, 0), at(40, 0)]),
      point(12),
      line([at(40, 0), at(80, 10)]),
    ]);

    expect(result.route.turnPoints).toEqual([]);
  });

  it("회전 지점이 경로 양 끝이면 버린다", () => {
    // Point 가 첫 LineString 보다 먼저 와서 index 가 -1 이 되는 응답
    const result = routeFromFeatures([point(12), line([at(0, 0), at(40, 0)])]);

    expect(result.route.turnPoints).toEqual([]);
  });

  it("좌표가 2개 미만이면 오류를 낸다", () => {
    expect(() => routeFromFeatures([line([at(0, 0)])])).toThrow();
  });
});

describe("isSignificantTurn", () => {
  const rightAngle = [at(0, 0), at(40, 0), at(40, 40)];

  it("직각으로 꺾이면 회전이다", () => {
    expect(isSignificantTurn(rightAngle, 1)).toBe(true);
  });

  it("양 끝 인덱스는 회전이 아니다", () => {
    expect(isSignificantTurn(rightAngle, 0)).toBe(false);
    expect(isSignificantTurn(rightAngle, 2)).toBe(false);
  });

  it("촘촘한 좌표의 완만한 커브를 회전으로 오인하지 않는다", () => {
    // 2m 간격으로 조금씩 휘는 길 — 인접 선분만 보면 각도가 튀지만 ±15m 로 재면 완만하다
    const gentle: Coordinate[] = [];
    for (let i = 0; i < 30; i += 1) gentle.push(at(i * 2, i * i * 0.01));
    expect(isSignificantTurn(gentle, 15)).toBe(false);
  });
});
