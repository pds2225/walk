"use client";
/**
 * K-TRIP Worldcup Market location-storage consent (Dasom 2026-10-16).
 * Location always works on the device; coordinates are sent only after an explicit "agree",
 * remembered in localStorage. Declining stores nothing. Never IP.
 */
export const GEO_CONSENT_KEY = "wcm:geo-consent";
export const GEO_RETENTION_DAYS = 365;
export type GeoConsent = "yes" | "no" | null;
export type GeoFix = { readonly latitude: number; readonly longitude: number; readonly accuracyMeters: number | null };

let lastFix: GeoFix | null = null;

export function getGeoConsent(): GeoConsent {
  try {
    const v = window.localStorage.getItem(GEO_CONSENT_KEY);
    return v === "yes" || v === "no" ? v : null;
  } catch {
    return null;
  }
}

export function setGeoConsent(value: "yes" | "no"): void {
  try { window.localStorage.setItem(GEO_CONSENT_KEY, value); } catch { /* private mode: ask again next time */ }
  if (value === "no") lastFix = null;
}

export function rememberFix(fix: GeoFix): void { lastFix = fix; }

/** The latest fix, only when the user agreed to storage; otherwise null (nothing sent). */
export function consentedPosition(): GeoFix | null {
  return getGeoConsent() === "yes" ? lastFix : null;
}

export const GEO_CONSENT_TEXT = {
  ko: { title: "위치 저장 동의", body: "서비스 개선을 위해 위치(좌표)를 저장해도 될까요? 저장한 위치는 1년 뒤 삭제해요. 거절해도 지도에서 내 위치는 그대로 볼 수 있어요.", yes: "동의", no: "거절" },
  en: { title: "Save location?", body: "May we store your location (coordinates) to improve the service? Stored locations are deleted after 1 year. If you decline, your location still shows on the map.", yes: "Agree", no: "Decline" },
  ja: { title: "位置情報の保存", body: "サービス改善のため位置情報（座標）を保存してもよいですか？保存した位置は1年後に削除します。拒否しても地図上の現在地はそのまま表示されます。", yes: "同意する", no: "拒否する" },
  zh: { title: "保存位置？", body: "为改进服务，可以保存您的位置（坐标）吗？保存的位置将在1年后删除。即使拒绝，地图上仍会显示您的位置。", yes: "同意", no: "拒绝" },
} as const;
