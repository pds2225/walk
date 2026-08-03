/** 브라우저와 API 라우트가 주고받는 모양. 엔진 타입(@walk/route-engine)을 그대로 쓴다. */
import type { Coordinate, RouteModel } from "@walk/route-engine";

export type { Coordinate, RouteModel };

/** 목적지 검색 후보 한 건. */
export interface PlaceHit {
  readonly name: string;
  readonly coordinate: Coordinate;
  /** 현재 위치를 함께 보냈을 때만 채워진다(직선거리, m). */
  readonly distanceMeters?: number;
}

/** 경로 응답 — 엔진이 쓰는 RouteModel 에 화면 표시용 정보를 얹는다. */
export interface RouteResponse {
  readonly route: RouteModel;
  readonly totalDistanceMeters: number | null;
  readonly totalSeconds: number | null;
  /** 회전점 id → TMAP 한국어 안내문("횡단보도 건너 좌회전" 등). */
  readonly turnDescriptions: Record<string, string>;
  readonly source: "tmap";
}

export interface ApiError {
  readonly error: string;
}
