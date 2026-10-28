"use client";

import { useEffect, useState } from "react";
import type { Fix } from "../lib/useGeolocation";
import type { Locale } from "../lib/i18n";
import { gpsQuality, initialGpsDiagnostics, updateGpsDiagnostics, type GpsQuality } from "../lib/gpsDiagnostics";

interface Props {
  readonly fix: Fix | null;
  readonly compassHeading: number | null;
  readonly movementHeading: number | null;
  readonly error: string | null;
  readonly locale: Locale;
}

const LABELS = {
  ko: {
    title: "GPS 상태", good: "좋음", fair: "보통", weak: "불안정", unknown: "확인 중",
    jump: "위치 급변 의심", accuracy: "마지막 수용 위치 오차", samples: "수용 위치 표본 수",
    current: "현재 GPS 측정", currentUnavailable: "확인 불가 (새 위치 반영 안 됨)",
    suspectedJumps: "수용 위치 기준 급변 의심 횟수", stationary: "수용 위치 기준 움직임", still: "정지 추정",
    moving: "이동 또는 확인 중", heading: "방향 정보", compass: "기기 나침반",
    movement: "GPS 이동 방향", unavailable: "방향 정보 없음", noData: "위치 수신 대기",
    note: "통계는 수용 위치만 집계하며 정확도 50m 초과 측정값은 제외됩니다. 진단은 안내 판정을 바꾸거나 좌표·진단 내역을 저장·전송하지 않습니다.",
  },
  en: {
    title: "GPS status", good: "Good", fair: "Fair", weak: "Weak", unknown: "Checking",
    jump: "Possible position jump", accuracy: "Last accepted position uncertainty", samples: "Accepted GPS samples",
    current: "Current GPS reading", currentUnavailable: "Unavailable (no new fix accepted)",
    suspectedJumps: "Suspected jumps (accepted fixes)", stationary: "Motion (accepted fixes)", still: "Likely stationary",
    moving: "Moving or checking", heading: "Heading source", compass: "Device compass",
    movement: "GPS movement", unavailable: "Unavailable", noData: "Waiting for location",
    note: "Stats use accepted fixes only; readings above 50m accuracy are excluded. Diagnostics do not change navigation or store/send coordinates or history.",
  },
  ja: {
    title: "GPS状態", good: "良好", fair: "普通", weak: "不安定", unknown: "確認中",
    jump: "位置の急変を検出", accuracy: "最後に採用した位置の誤差半径", samples: "採用した位置情報の件数",
    current: "現在のGPS測定", currentUnavailable: "確認不可（新しい位置は未反映）",
    suspectedJumps: "採用位置の急変疑い件数", stationary: "採用位置に基づく動き", still: "静止と推定",
    moving: "移動中または確認中", heading: "方向情報", compass: "端末のコンパス",
    movement: "GPS移動方向", unavailable: "情報なし", noData: "位置情報を待機中",
    note: "統計は採用した位置のみを集計し、精度が50mを超える測定は除外します。診断はナビの判定を変えず、座標・履歴を保存・送信しません。",
  },
  zh: {
    title: "GPS状态", good: "良好", fair: "一般", weak: "不稳定", unknown: "检测中",
    jump: "疑似位置跳变", accuracy: "最近采纳位置的误差半径", samples: "已采纳位置样本数",
    current: "当前GPS测量", currentUnavailable: "无法确认（未更新有效位置）",
    suspectedJumps: "已采纳位置的疑似跳变次数", stationary: "已采纳位置的运动状态", still: "可能静止",
    moving: "移动中或检测中", heading: "方向来源", compass: "设备指南针",
    movement: "GPS移动方向", unavailable: "无方向信息", noData: "等待定位",
    note: "统计仅包括已采纳位置，精度超过50米的测量不计入。诊断不改变导航判断，也不存储或发送坐标及记录。",
  },
} satisfies Record<Locale, Record<string, string>>;

export default function GpsDiagnosticsPanel({ fix, compassHeading, movementHeading, error, locale }: Props) {
  const [diagnostics, setDiagnostics] = useState(initialGpsDiagnostics);
  useEffect(() => {
    if (fix) setDiagnostics((previous) => updateGpsDiagnostics(previous, fix));
  }, [fix]);

  const t = LABELS[locale];
  const quality: GpsQuality = gpsQuality(diagnostics.lastAccuracyMeters);
  const status = error ? t.weak : diagnostics.received === 0 ? t.unknown :
    diagnostics.lastWasJump ? t.jump : t[quality];
  const heading = compassHeading !== null ? t.compass :
    movementHeading !== null ? t.movement : t.unavailable;

  return (
    <details className="gps-diagnostics">
      <summary>{t.title} · {status}</summary>
      <dl>
        {error ? <div><dt>{t.current}</dt><dd>{t.currentUnavailable}</dd></div> : null}
        <div><dt>{t.accuracy}</dt><dd>{diagnostics.lastAccuracyMeters === null ? t.noData : `±${Math.round(diagnostics.lastAccuracyMeters)}m`}</dd></div>
        <div><dt>{t.samples}</dt><dd>{diagnostics.received}</dd></div>
        <div><dt>{t.suspectedJumps}</dt><dd>{diagnostics.suspectedJumps}</dd></div>
        <div><dt>{t.stationary}</dt><dd>{diagnostics.stationary ? t.still : t.moving}</dd></div>
        <div><dt>{t.heading}</dt><dd>{heading}</dd></div>
      </dl>
      <p className="gps-diagnostics-note">{t.note}</p>
    </details>
  );
}
