"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { Locale } from "../lib/i18n";
import { getNavGeoConsent, setNavGeoConsent } from "../lib/wcmGeoConsent";

const COPY = {
  ko: {
    title: "보행 GPS 이동기록 저장",
    notice: "동의하면 도보안내 중 위치좌표·정확도를 30초 경과 또는 50m 이동할 때 기록하여 이동경로를 분석합니다. 수집한 좌표는 최대 1년 보관하며 AI하우스 등 제3자에게 제공하지 않습니다. 거부해도 길찾기를 이용할 수 있고, 철회하면 이후 위치기록 저장을 중단합니다. 기존 기록 삭제는 개인정보 처리방침에 안내된 방법으로 요청할 수 있습니다.",
    yes: "이동기록 저장 동의",
    no: "이동기록 저장 거부·철회",
    enabled: "동의함",
    disabled: "동의 안 함",
    saveError: "브라우저 저장소 문제로 선택을 저장하지 못했습니다. 동의가 저장되지 않으면 GPS를 기록하지 않습니다. 철회가 실패했다면 새로고침 전 사이트 데이터를 확인하세요.",
    manage: "GPS 이동기록 설정",
    close: "닫기",
  },
  en: {
    title: "Save walking GPS records",
    notice: "With your consent, navigation locations and accuracy are recorded every 30 seconds or 50 meters to analyze the walking route. Coordinates are retained for up to one year and are not shared with AIHows or other third parties. Navigation works without consent. Withdrawal stops future location recording. Contact us through the privacy policy to request deletion of earlier records.",
    yes: "Agree to record",
    no: "Decline or withdraw",
    enabled: "Agreed",
    disabled: "Not agreed",
    saveError: "The browser could not save your choice. Unpersisted consent does not enable GPS recording. If withdrawal fails, check site data before reloading.",
    manage: "GPS recording settings",
    close: "Close",
  },
  ja: {
    title: "歩行GPS移動記録の保存",
    notice: "同意した場合のみ、徒歩案内中の位置座標と精度を30秒経過または50m移動ごとに保存し、移動経路を分析します。保存期間は最長1年間です。AIハウスなどの第三者には提供しません。同意しなくても道案内を利用できます。撤回後は新しい記録を保存しません。過去の記録の削除はプライバシーポリシーから申請できます。",
    yes: "保存に同意",
    no: "拒否・撤回",
    enabled: "同意済み",
    disabled: "未同意",
    saveError: "ブラウザーに選択を保存できません。保存できない同意ではGPSを記録しません。撤回が失敗した場合は再読み込み前にサイトデータを確認してください。",
    manage: "GPS記録設定",
    close: "閉じる",
  },
  zh: {
    title: "保存步行GPS轨迹",
    notice: "仅在同意后，步行导航期间每经过30秒或移动50米记录位置坐标和精度，以分析行走路线。数据最长保存一年，不提供给AIHows或其他第三方。拒绝不影响导航；撤回后停止记录新位置。历史记录的删除可通过隐私政策申请。",
    yes: "同意保存",
    no: "拒绝或撤回",
    enabled: "已同意",
    disabled: "未同意",
    saveError: "浏览器无法保存您的选择。未保存的同意不会启用GPS记录。如果撤回失败，请在刷新页面前检查站点数据。",
    manage: "GPS记录设置",
    close: "关闭",
  },
} satisfies Record<Locale, { title: string; notice: string; yes: string; no: string; enabled: string; disabled: string; saveError: string; manage: string; close: string }>;

type ConsentMode = "prompt" | "manage";

interface LocationStorageConsentProps {
  readonly locale: Locale;
  readonly mode?: ConsentMode;
  /** Runs only after an explicit choice (or an Escape treated as refusal). */
  readonly onResolved?: () => void;
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  display: "grid",
  placeItems: "center",
  padding: 16,
  backgroundColor: "rgba(15, 23, 42, 0.64)",
};

const dialogStyle: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  maxWidth: 480,
  maxHeight: "calc(100dvh - 32px)",
  overflowY: "auto",
  padding: 24,
  borderRadius: 16,
  backgroundColor: "#ffffff",
  color: "#17212b",
  boxShadow: "0 20px 55px rgba(0, 0, 0, 0.28)",
  lineHeight: 1.65,
};

const primaryStyle: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 8,
  backgroundColor: "#175ad7",
  color: "#ffffff",
  border: "1px solid #175ad7",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryStyle: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 8,
  backgroundColor: "#ffffff",
  color: "#17212b",
  border: "1px solid #a8b0bb",
  fontWeight: 600,
  cursor: "pointer",
};

/**
 * First visit: a modal gate before the navigation screen requests device GPS.
 * Subsequent visits: a compact settings button that reopens the same modal.
 * Closing the initial modal without choosing is treated as declining storage.
 */
export default function LocationStorageConsent({
  locale, mode = "manage", onResolved,
}: LocationStorageConsentProps) {
  const [choice, setChoice] = useState<"yes" | "no" | null>(() =>
    typeof window === "undefined" ? null : getNavGeoConsent(),
  );
  const [open, setOpen] = useState(mode === "prompt");
  const [saveError, setSaveError] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dismissRef = useRef<() => void>(() => undefined);
  const completedRef = useRef(false);
  const headingId = useId();
  const noticeId = useId();
  const copy = COPY[locale];

  useEffect(() => { setChoice(getNavGeoConsent()); }, []);

  function finish() {
    setOpen(false);
    if (mode === "prompt" && !completedRef.current) {
      completedRef.current = true;
      onResolved?.();
    }
  }

  function decide(value: "yes" | "no") {
    const persisted = setNavGeoConsent(value);
    const current = getNavGeoConsent();
    setChoice(current);
    setSaveError(!persisted);

    // A failed agreement never authorizes location recording.
    if (value === "yes" && !persisted) return;
    // Declining still permits walking if storage is blocked: the existing
    // in-memory revocation guard prevents recording for this page.
    if (value === "no" && !persisted && mode === "manage") return;
    finish();
  }

  dismissRef.current = () => {
    if (mode === "prompt") decide("no");
    else setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    headingRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissRef.current();
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const current = document.activeElement;
      if (!focusable.includes(current as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  return (
    <>
      {mode === "manage" ? (
        <button
          type="button"
          className="location-storage-consent-trigger"
          style={{ padding: "9px 12px", border: "1px solid #8c96a5", borderRadius: 8, backgroundColor: "#fff", color: "#17212b" }}
          onClick={() => {
            setChoice(getNavGeoConsent());
            setSaveError(false);
            setOpen(true);
          }}
        >
          {copy.manage}: {choice === "yes" ? copy.enabled : copy.disabled}
        </button>
      ) : null}

      {open ? (
        <div className="gps-consent-backdrop" style={backdropStyle}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            aria-describedby={noticeId}
            className="gps-consent-modal"
            style={dialogStyle}
          >
            <h2 id={headingId} ref={headingRef} tabIndex={-1} style={{ fontSize: 20, margin: "0 0 12px" }}>
              {copy.title}
            </h2>
            <p id={noticeId} style={{ margin: "0 0 12px" }}>{copy.notice}</p>
            <p style={{ margin: "0 0 12px" }}>
              <a href="/worldcup-market/privacy" target="_blank" rel="noreferrer">
                개인정보 처리방침 · Privacy Policy
              </a>
            </p>
            <p aria-live="polite" style={{ margin: "0 0 16px", fontWeight: 600 }}>
              {copy.title}: {choice === "yes" ? copy.enabled : copy.disabled}
            </p>
            {saveError ? <p role="alert" style={{ color: "#a21d18" }}>{copy.saveError}</p> : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button type="button" aria-pressed={choice === "yes"} onClick={() => decide("yes")} style={primaryStyle}>
                {copy.yes}
              </button>
              <button type="button" aria-pressed={choice !== "yes"} onClick={() => decide("no")} style={secondaryStyle}>
                {copy.no}
              </button>
              {mode === "manage" ? (
                <button type="button" onClick={() => setOpen(false)} style={secondaryStyle}>{copy.close}</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
