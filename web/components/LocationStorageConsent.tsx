"use client";

import { useEffect, useState } from "react";
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
  },
  en: {
    title: "Save walking GPS records",
    notice: "With your consent, navigation locations and accuracy are recorded every 30 seconds or 50 meters to analyze the walking route. Coordinates are retained for up to one year and are not shared with AIHows or other third parties. Navigation works without consent. Withdrawal stops future location recording. Contact us through the privacy policy to request deletion of earlier records.",
    yes: "Agree to record",
    no: "Decline or withdraw",
    enabled: "Agreed",
    disabled: "Not agreed",
    saveError: "The browser could not save your choice. Unpersisted consent does not enable GPS recording. If withdrawal fails, check site data before reloading.",
  },
  ja: {
    title: "歩行GPS移動記録の保存",
    notice: "同意した場合のみ、徒歩案内中の位置座標と精度を30秒経過または50m移動ごとに保存し、移動経路を分析します。保存期間は最長1年間です。AIハウスなどの第三者には提供しません。同意しなくても道案内を利用できます。撤回後は新しい記録を保存しません。過去の記録の削除はプライバシーポリシーから申請できます。",
    yes: "保存に同意",
    no: "拒否・撤回",
    enabled: "同意済み",
    disabled: "未同意",
    saveError: "ブラウザーに選択を保存できません。保存できない同意ではGPSを記録しません。撤回が失敗した場合は再読み込み前にサイトデータを確認してください。",
  },
  zh: {
    title: "保存步行GPS轨迹",
    notice: "仅在同意后，步行导航期间每经过30秒或移动50米记录位置坐标和精度，以分析行走路线。数据最长保存一年，不提供给AIHows或其他第三方。拒绝不影响导航；撤回后停止记录新位置。历史记录的删除可通过隐私政策申请。",
    yes: "同意保存",
    no: "拒绝或撤回",
    enabled: "已同意",
    disabled: "未同意",
    saveError: "浏览器无法保存您的选择。未保存的同意不会启用GPS记录。如果撤回失败，请在刷新页面前检查站点数据。",
  },
} satisfies Record<Locale, { title: string; notice: string; yes: string; no: string; enabled: string; disabled: string; saveError: string }>;

export default function LocationStorageConsent({ locale }: { readonly locale: Locale }) {
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => { setChoice(getNavGeoConsent()); }, []);
  const copy = COPY[locale];

  const decide = (value: "yes" | "no") => {
    const persisted = setNavGeoConsent(value);
    setChoice(getNavGeoConsent());
    setSaveError(!persisted); // Explain when restricted browser storage prevented persistence.
  };

  return (
    <details className="location-storage-consent" style={{ padding: "12px", background: "#fff", color: "#17212b" }}>
      <summary>{copy.title}: {choice === "yes" ? copy.enabled : copy.disabled}</summary>
      <p>{copy.notice}</p>
      <p><a href="/worldcup-market/privacy" target="_blank" rel="noreferrer">개인정보 처리방침 · Privacy Policy</a></p>
      <button type="button" aria-pressed={choice === "yes"} onClick={() => decide("yes")}>{copy.yes}</button>{" "}
      <button type="button" aria-pressed={choice !== "yes"} onClick={() => decide("no")}>{copy.no}</button>
      {saveError ? <p role="alert">{copy.saveError}</p> : null}
    </details>
  );
}
