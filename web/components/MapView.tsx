"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { Coordinate, RouteModel } from "@walk/route-engine";

/** 파이썬판 maplibre 컴포넌트와 같은 무료 타일 — 키가 필요 없다. */
const STYLE_URL = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const ZOOM = 17;

/**
 * 타일을 못 받았을 때 쓰는 최소 스타일(네트워크 0회).
 *
 * 지하도·신호 약한 골목에서 타일 요청이 실패하면 style 이 load 되지 않아, 그 위에
 * 얹는 경로선까지 통째로 사라진다. 배경이 없어도 '경로선과 내 위치'만 보이면 방향은
 * 잡을 수 있으므로, 지도가 없는 상태로라도 안내를 이어간다.
 */
const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#eef1f5" } }],
};

export interface MapViewProps {
  readonly route: RouteModel | null;
  readonly here: Coordinate | null;
  /** 지도를 돌릴 방위(도). null 이면 북쪽 고정. */
  readonly headingDegrees: number | null;
  /** true 면 진행 방향이 항상 위로 오게 지도를 돌린다(헤딩업). */
  readonly headingUp: boolean;
  readonly offRoute: boolean;
}

function lineFeature(route: RouteModel | null): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: (route?.polyline ?? []).map((c) => [c.longitude, c.latitude]),
    },
  };
}

function turnFeatures(route: RouteModel | null): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: (route?.turnPoints ?? []).map((turn) => ({
      type: "Feature",
      properties: { label: turn.direction === "left" ? "◀" : turn.direction === "right" ? "▶" : "▲" },
      geometry: { type: "Point", coordinates: [turn.coordinate.longitude, turn.coordinate.latitude] },
    })),
  };
}

function destFeature(route: RouteModel | null): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const last = route?.polyline[route.polyline.length - 1];
  return {
    type: "FeatureCollection",
    features: last
      ? [{
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [last.longitude, last.latitude] },
        }]
      : [],
  };
}

/** 경로 전체가 한눈에 들어오도록 화면을 맞춘다(안내 시작 전 확인용). */
function fitRoute(instance: MapLibreMap, route: RouteModel | null): void {
  if (!route || route.polyline.length < 2) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const c of route.polyline) bounds.extend([c.longitude, c.latitude]);
  instance.fitBounds(bounds, { padding: 60, duration: 600, maxZoom: ZOOM });
}

/**
 * 경로·회전점·현재 위치를 지도 '위에' 그린다.
 *
 * Streamlit 판에서 못 하던 것이 이 부분이다: 저기서는 매 rerun 마다 지도 컴포넌트를
 * 통째로 다시 만들어 화면이 끊기고 사용자가 움직인 시점·확대 배율도 초기화됐다.
 * 여기서는 지도 인스턴스를 한 번만 만들고, 이후에는 GeoJSON 소스의 데이터만 갈아끼운다.
 */
export default function MapView({ route, here, headingDegrees, headingUp, offRoute }: MapViewProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  const userMoved = useRef(false);
  // 'load' 는 지도 생성 후, 그리고 배경 폴백 시 한 번 더 발생한다. 그 시점의 최신
  // 경로를 써야 해서 ref 로 들고 있는다(생성 effect 의 클로저는 낡은 값을 잡는다).
  const routeRef = useRef(route);
  routeRef.current = route;

  // ── 지도 생성 (한 번만) ────────────────────────────────────────────────────
  useEffect(() => {
    if (!container.current || map.current) return;

    const first = here ?? route?.polyline[0] ?? { latitude: 37.5665, longitude: 126.978 };
    const instance = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: [first.longitude, first.latitude],
      zoom: ZOOM,
      attributionControl: { compact: true },
    });
    map.current = instance;

    // 사용자가 직접 지도를 만졌으면 자동 따라가기를 멈춘다 — 주변을 살펴보는 중에
    // 화면이 계속 현재 위치로 튕겨 돌아오면 지도를 볼 수가 없다.
    instance.on("dragstart", () => { userMoved.current = true; });

    // 배경 타일을 못 받으면 배경만 버리고 경로선은 살린다(FALLBACK_STYLE 주석 참조).
    // setStyle 은 다시 'load' 를 발생시켜 아래 레이어 등록이 그대로 이어진다.
    let fellBack = false;
    instance.on("error", (event) => {
      const failedStyle = !instance.isStyleLoaded();
      if (!fellBack && failedStyle) {
        fellBack = true;
        console.warn("지도 배경을 불러오지 못해 경로만 표시합니다.", event?.error?.message ?? "");
        instance.setStyle(FALLBACK_STYLE);
      }
    });

    instance.on("load", () => {
      instance.addSource("route", { type: "geojson", data: lineFeature(routeRef.current) });
      instance.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 11, "line-opacity": 0.9 },
      });
      instance.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1b64da", "line-width": 6 },
      });

      instance.addSource("turns", { type: "geojson", data: turnFeatures(routeRef.current) });
      instance.addLayer({
        id: "turn-dots",
        type: "circle",
        source: "turns",
        paint: {
          "circle-radius": 7,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#1b64da",
          "circle-stroke-width": 3,
        },
      });

      instance.addSource("dest", { type: "geojson", data: destFeature(routeRef.current) });
      instance.addLayer({
        id: "dest-dot",
        type: "circle",
        source: "dest",
        paint: {
          "circle-radius": 9,
          "circle-color": "#e11d48",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });

      ready.current = true;
      fitRoute(instance, routeRef.current);   // 폴백 경로로 늦게 load 된 경우에도 화면을 맞춘다
    });

    return () => {
      instance.remove();
      map.current = null;
      ready.current = false;
    };
    // 최초 1회만 — route/here 는 아래 훅들이 소스 데이터만 갈아끼운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 경로가 바뀌면 소스만 교체 ──────────────────────────────────────────────
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready.current) return;
    (instance.getSource("route") as GeoJSONSource | undefined)?.setData(lineFeature(route));
    (instance.getSource("turns") as GeoJSONSource | undefined)?.setData(turnFeatures(route));
    (instance.getSource("dest") as GeoJSONSource | undefined)?.setData(destFeature(route));

    if (route && route.polyline.length >= 2) userMoved.current = false;
    fitRoute(instance, route);
  }, [route]);

  // ── 현재 위치 마커 + 따라가기 ──────────────────────────────────────────────
  const marker = useRef<maplibregl.Marker | null>(null);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !here) return;

    if (!marker.current) {
      const el = document.createElement("div");
      el.className = "here-marker";
      el.innerHTML = '<div class="here-arrow"></div><div class="here-dot"></div>';
      marker.current = new maplibregl.Marker({ element: el, rotationAlignment: "map" })
        .setLngLat([here.longitude, here.latitude])
        .addTo(instance);
    } else {
      marker.current.setLngLat([here.longitude, here.latitude]);
    }
    if (headingDegrees !== null) marker.current.setRotation(headingDegrees);

    if (!userMoved.current) {
      instance.easeTo({
        center: [here.longitude, here.latitude],
        bearing: headingUp && headingDegrees !== null ? headingDegrees : 0,
        duration: 400,
      });
    }
  }, [here, headingDegrees, headingUp]);

  return (
    <div className="map-wrap">
      <div ref={container} className={`map ${offRoute ? "map-off" : ""}`} />
      {/* 사용자가 지도를 움직인 뒤 현재 위치로 돌아오는 버튼 */}
      <button
        type="button"
        className="recenter"
        onClick={() => {
          userMoved.current = false;
          if (here) {
            map.current?.easeTo({ center: [here.longitude, here.latitude], zoom: ZOOM, duration: 400 });
          }
        }}
      >
        내 위치
      </button>
    </div>
  );
}
