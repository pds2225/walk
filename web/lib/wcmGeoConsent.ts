"use client";
/**
 * K-TRIP Worldcup Market location-storage consent (Dasom 2026-10-16).
 * Location always works on the device; coordinates are sent only after an explicit "agree",
 * remembered in localStorage. Declining stores nothing. Never IP.
 * Retention finalized at 1 year (Dasom 2026-10-29) — see migration 20261016220000 cron job.
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
  ko: { title: "위치 정보 안내", body: "더 나은 서비스를 위해, 동의하시면 대략적인 위치 좌표를 저장하며 1년 후 삭제됩니다. IP 주소는 저장하지 않아요. 거절해도 지도는 그대로 이용할 수 있어요.", yes: "동의", no: "거절" },
  en: { title: "We value your privacy", body: "With your consent, we store your approximate location coordinates to improve our service. They are deleted after 1 year, and we do not store your IP address. You can still use the map if you decline.", yes: "Accept", no: "Decline" },
  ja: { title: "位置情報について", body: "サービス向上のため、同意いただいた場合はおおよその位置座標を保存し、1年後に削除します。IPアドレスは保存しません。拒否しても地図はそのままご利用いただけます。", yes: "同意する", no: "拒否する" },
  zh: { title: "隐私提示", body: "为改进服务，经您同意后我们会保存您的大致位置坐标，并在1年后删除。我们不会保存您的IP地址。即使拒绝，您仍可正常使用地图。", yes: "接受", no: "拒绝" },
} as const;
