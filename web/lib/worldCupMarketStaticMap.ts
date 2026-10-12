import type { Coordinate } from "./types";
import {
  layoutWorldCupMarketMapPins,
  WORLD_CUP_MARKET_MAP_PLACEMENTS,
  type WorldCupMarketMapPoint,
} from "./worldCupMarketMapLayout";

/**
 * 월드컵시장 첫 화면의 고정 지도 이미지 설정. 이미지 교체는 이 파일 한 곳만 고친다.
 *
 * 1) 지리 좌표가 맞는 지도로 교체: `web/public/worldcup-market/`에 새 파일을 넣고
 *    `src`, `width`/`height`(CSS 기준 크기, 파일은 2배 해상도 권장), `bounds`(이미지 네 변의
 *    위도/경도, Web Mercator), `attribution`을 바꾼다. 핀은 기존 표시 좌표를 자동 투영한다.
 * 2) 시장에서 받은 공식 안내도처럼 지리 좌표가 없는 배치도: `bounds`를 null 로 두고
 *    `WORLD_CUP_MARKET_STATIC_MAP_POSITION_OVERRIDES`에 점포별 x/y(0–100%)를 채운다.
 *    TODO(공식 안내도): 안내도를 받으면 점포 번호와 위치를 확인해 여기 채운다.
 *
 * 현재 이미지: OpenStreetMap 데이터(2026-10-12 Overpass 1회 조회)의 도로·건물·도로명만
 * `scripts/worldcup-market/render_static_map.py`로 그린 728×790 WebP(2배 해상도).
 * 시장 경계 표시는 넣지 않았다. 데이터 © OpenStreetMap contributors (ODbL).
 */
export interface WorldCupMarketStaticMapBounds {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

export interface WorldCupMarketStaticMapConfig {
  readonly src: string;
  /** CSS px 기준 기본 크기. 화면에서는 이 비율을 유지한 채 확대/축소된다. */
  readonly width: number;
  readonly height: number;
  readonly bounds: WorldCupMarketStaticMapBounds | null;
  readonly attribution: { readonly label: string; readonly href: string };
}

export const WORLD_CUP_MARKET_STATIC_MAP: WorldCupMarketStaticMapConfig = {
  src: "/worldcup-market/market-map.webp",
  width: 364,
  height: 395,
  bounds: {
    north: 37.55941363579089,
    south: 37.5568675921353,
    west: 126.90404337128064,
    east: 126.90700303244961,
  },
  attribution: { label: "© OpenStreetMap contributors", href: "https://www.openstreetmap.org/copyright" },
};

/** 지리 좌표가 없는 배치도용 점포별 위치(이미지 기준 0–100%). 값이 있으면 투영보다 우선한다. */
export const WORLD_CUP_MARKET_STATIC_MAP_POSITION_OVERRIDES: Readonly<Record<string, { readonly x: number; readonly y: number }>> = {};

function mercatorY(latitude: number): number {
  const sin = Math.sin(latitude * Math.PI / 180);
  return Math.log((1 + sin) / (1 - sin)) / 2;
}

/** 좌표를 이미지 위 위치(0–100%)로 바꾼다. 경계 밖이면 null. */
export function projectToStaticMap(
  coordinate: Coordinate,
  bounds: WorldCupMarketStaticMapBounds,
): { x: number; y: number } | null {
  const x = (coordinate.longitude - bounds.west) / (bounds.east - bounds.west) * 100;
  const top = mercatorY(bounds.north);
  const y = (top - mercatorY(coordinate.latitude)) / (top - mercatorY(bounds.south)) * 100;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) return null;
  return { x, y };
}

export interface WorldCupMarketStaticMapPin {
  readonly storeId: string;
  /** 핀 버튼 위치(%) — 겹치지 않도록 격자에 맞춰 옮겨질 수 있다. */
  readonly x: number;
  readonly y: number;
  /** 표시 좌표가 실제로 투영된 위치(%). 연결선 시작점. */
  readonly anchorX: number;
  readonly anchorY: number;
}

/**
 * 보이는 점포의 핀 위치. 필터와 관계없이 같은 표시 좌표를 쓰며, 겹침 처리는 실시간 지도와
 * 같은 26px 격자 배치를 이미지 기본 크기에서 계산한 뒤 %로 바꾼다.
 */
export function layoutWorldCupMarketStaticMapPins(
  storeIds: readonly string[],
  config: WorldCupMarketStaticMapConfig = WORLD_CUP_MARKET_STATIC_MAP,
  overrides: Readonly<Record<string, { readonly x: number; readonly y: number }>> = WORLD_CUP_MARKET_STATIC_MAP_POSITION_OVERRIDES,
): readonly WorldCupMarketStaticMapPin[] {
  const points: WorldCupMarketMapPoint[] = [];
  for (const storeId of storeIds) {
    const override = overrides[storeId];
    const placement = WORLD_CUP_MARKET_MAP_PLACEMENTS.find((item) => item.storeId === storeId);
    const position = override ?? (placement && config.bounds ? projectToStaticMap(placement.displayLocation, config.bounds) : null);
    if (!position) continue;
    points.push({ storeId, x: position.x / 100 * config.width, y: position.y / 100 * config.height });
  }
  return layoutWorldCupMarketMapPins(points, config.width, config.height).map((pin) => ({
    storeId: pin.storeId,
    x: pin.x / config.width * 100,
    y: pin.y / config.height * 100,
    anchorX: pin.anchorX / config.width * 100,
    anchorY: pin.anchorY / config.height * 100,
  }));
}
