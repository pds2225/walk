"use client";

import { useEffect, useRef, useState } from "react";

const RADIUS_M = 100;
const MOVE_M = 10;

export interface RoadviewProps {
  readonly appkey: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly headingDegrees: number | null;
}

interface Viewpoint {
  pan: number;
}

interface KakaoRoadview {
  setPanoId: (panoId: string, pos: unknown) => void;
  getViewpoint: () => Viewpoint | null;
  setViewpoint: (vp: Viewpoint) => void;
  relayout?: () => void;
}

interface KakaoRoadviewClient {
  getNearestPanoId: (
    pos: unknown,
    radius: number,
    cb: (panoId: string | null) => void,
  ) => void;
}

interface KakaoMaps {
  load: (cb: () => void) => void;
  LatLng: new (lat: number, lng: number) => unknown;
  Roadview: new (el: HTMLElement) => KakaoRoadview;
  RoadviewClient: new () => KakaoRoadviewClient;
  event: { addListener: (target: KakaoRoadview, name: string, cb: () => void) => void };
}

function kakaoMaps(): KakaoMaps | null {
  const maps = (window as Window & { kakao?: { maps?: KakaoMaps } }).kakao?.maps;
  return maps && maps.Roadview && maps.RoadviewClient ? maps : null;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLng = (lng2 - lng1) * toR;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

let sdkState: "idle" | "loading" | "ready" | "error" = "idle";
const sdkWait: Array<(ok: boolean) => void> = [];

function loadSdk(appkey: string, done: (ok: boolean) => void): void {
  if (kakaoMaps()) {
    sdkState = "ready";
    done(true);
    return;
  }
  if (sdkState === "error") {
    done(false);
    return;
  }
  sdkWait.push(done);
  if (sdkState === "loading") return;
  sdkState = "loading";
  const existing = document.querySelector<HTMLScriptElement>("script[data-walk-kakao-sdk]");
  if (existing) return;
  const s = document.createElement("script");
  s.dataset.walkKakaoSdk = "1";
  s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appkey)}&autoload=false`;
  s.onload = () => {
    const loader = (window as Window & { kakao?: { maps?: KakaoMaps } }).kakao?.maps;
    if (!loader?.load) {
      sdkState = "error";
      sdkWait.splice(0).forEach((fn) => fn(false));
      return;
    }
    loader.load(() => {
      sdkState = kakaoMaps() ? "ready" : "error";
      const ok = sdkState === "ready";
      sdkWait.splice(0).forEach((fn) => fn(ok));
    });
  };
  s.onerror = () => {
    sdkState = "error";
    sdkWait.splice(0).forEach((fn) => fn(false));
  };
  document.head.appendChild(s);
}

/**
 * 안내 중 카카오 로드뷰. 키를 화면에 그리지 않는다.
 * Streamlit `kakao_roadview` 와 같은 계약: 100m 안 pano, 10m 이상 이동 시에만 재조회.
 */
export default function Roadview({ appkey, latitude, longitude, headingDegrees }: RoadviewProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const rvRef = useRef<KakaoRoadview | null>(null);
  const clientRef = useRef<KakaoRoadviewClient | null>(null);
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);
  const headingRef = useRef<number | null>(headingDegrees);
  headingRef.current = headingDegrees;
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!appkey) {
      setMessage("JavaScript 키가 없어 로드뷰를 표시할 수 없습니다.");
      return;
    }
    if (latitude == null || longitude == null) {
      setMessage("위치 정보가 없어 로드뷰를 표시할 수 없습니다.");
      return;
    }

    let cancelled = false;
    loadSdk(appkey, (ok) => {
      if (cancelled) return;
      if (!ok) {
        setMessage("카카오 지도를 불러오지 못했습니다. JavaScript 키와 허용 도메인을 확인하세요.");
        return;
      }
      const maps = kakaoMaps();
      const el = container.current;
      if (!maps || !el) return;

      if (!rvRef.current) {
        const rv = new maps.Roadview(el);
        const client = new maps.RoadviewClient();
        const applyHeading = () => {
          const heading = headingRef.current;
          if (heading == null) return;
          try {
            const vp = rv.getViewpoint();
            if (!vp) return;
            vp.pan = Number(heading) % 360;
            rv.setViewpoint(vp);
          } catch {
            /* init 전 viewpoint 는 없을 수 있다 */
          }
        };
        maps.event.addListener(rv, "init", applyHeading);
        maps.event.addListener(rv, "panoid_changed", applyHeading);
        rvRef.current = rv;
        clientRef.current = client;
      }

      const prev = lastPos.current;
      const moved = prev == null || haversine(prev.lat, prev.lng, latitude, longitude) >= MOVE_M;
      lastPos.current = { lat: latitude, lng: longitude };
      if (!moved) {
        const heading = headingRef.current;
        if (heading != null && rvRef.current) {
          try {
            const vp = rvRef.current.getViewpoint();
            if (vp) {
              vp.pan = Number(heading) % 360;
              rvRef.current.setViewpoint(vp);
            }
          } catch {
            /* ignore */
          }
        }
        return;
      }

      const pos = new maps.LatLng(latitude, longitude);
      clientRef.current?.getNearestPanoId(pos, RADIUS_M, (panoId) => {
        if (cancelled) return;
        if (!panoId) {
          setMessage("이 위치 근처에는 로드뷰가 없습니다. 도로 쪽으로 이동해 보세요.");
          return;
        }
        setMessage(null);
        rvRef.current?.setPanoId(panoId, pos);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [appkey, latitude, longitude]);

  useEffect(() => {
    const rv = rvRef.current;
    if (headingDegrees == null || !rv) return;
    try {
      const vp = rv.getViewpoint();
      if (!vp) return;
      vp.pan = Number(headingDegrees) % 360;
      rv.setViewpoint(vp);
    } catch {
      /* ignore */
    }
  }, [headingDegrees]);

  return (
    <div className="roadview-wrap" role="region" aria-label="로드뷰">
      <div ref={container} className="roadview" />
      {message ? <p className="roadview-msg">{message}</p> : null}
    </div>
  );
}
