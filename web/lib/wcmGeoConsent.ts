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

export const PRIVACY_POLICY_PATH = "/worldcup-market/privacy";

/** Popup copy: one sentence; `link` is rendered as a hyperlink to the privacy policy (new tab). */
export const GEO_CONSENT_TEXT = {
  ko: { label: "위치 정보 수집 동의", before: "", link: "개인정보 처리방침", after: "에 따라 서비스 개선을 위한 위치 좌표(위도·경도)와 정확도 정보 수집·저장(보관 기간 1년)에 동의하시겠습니까?", yes: "동의", no: "동의 안 함" },
  en: { label: "Location consent", before: "In accordance with our ", link: "Privacy Policy", after: ", do you agree to the collection and storage of your location coordinates (latitude and longitude) and accuracy to improve our service (retained for 1 year)?", yes: "Agree", no: "Disagree" },
  ja: { label: "位置情報の収集への同意", before: "", link: "プライバシーポリシー", after: "に基づき、サービス改善のための位置座標（緯度・経度）と精度情報の収集・保存（保存期間1年）に同意しますか？", yes: "同意する", no: "同意しない" },
  zh: { label: "位置信息收集同意", before: "根据", link: "隐私政策", after: "，您是否同意为改进服务而收集并保存您的位置坐标（纬度、经度）及精度信息（保存期限1年）？", yes: "同意", no: "不同意" },
} as const;
