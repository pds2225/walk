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
    jump: "위치 급변 의심", accuracy: "위치 오차 반경", samples: "수신한 위치 표본",
    suspectedJumps: "위치 급변 의심 횟수", stationary: "움직임", still: "정지 추정",
    moving: "이동 또는 확인 중", heading: "방향 정보", compass: "기기 나침반",
    movement: "GPS 이동 방향", unavailable: "방향 정보 없음", noData: "위치 수신 대기",
    note: "진단은 안내 판정을 변경하지 않으며, 좌표와 진단 내역을 따로 저장·전송하지 않습니다.",
  },
  en: {
    title: "GPS status", good: "Good", fair: "Fair", weak: "Weak", unknown: "Checking",
    jump: "Possible position jump", accuracy: "Position uncertainty", samples: "GPS samples",
    suspectedJumps: "Suspected jumps", stationary: "Motion", still: "Likely stationary",
    moving: "Moving or checking", heading: "Heading source", compass: "Device compass",
    movement: "GPS movement", unavailable: "Unavailable", noData: "Waiting for location",
    note: "Diagnostics do not change navigation decisions. Coordinates and diagnostics are not saved or sent.",
  },
  ja: {
    title: "GPS状態", good: "良好", fair: "普通", weak: "不安定", unknown: "確認中",
    jump: "位置の急変を検出", accuracy: "位置の誤差半径", samples: "受信した位置情報",
    suspectedJumps: "位置急変の疑い", stationary: "動き", still: "静止と推定",
    moving: "移動中または確認中", heading: "方向情報", compass: "端末のコンパス",
    movement: "GPS移動方向", unavailable: "情報なし", noData: "位置情報を待機中",
    note: "診断はナビの判定を変更せず、座標や診断履歴を保存・送信しません。",
  },
  zh: {
    title: "GPS状态", good: "良好", fair: "一般", weak: "不稳定", unknown: "检测中",
    jump: "疑似位置跳变", accuracy: "位置误差半径", samples: "接收位置样本",
    suspectedJumps: "疑似跳变次数", stationary: "运动状态", still: "可能静止",
    moving: "移动中或检测中", heading: "方向来源", compass: "设备指南针",
    movement: "GPS移动方向", unavailable: "无方向信息", noData: "等待定位",
    note: "诊断不会改变导航判断，也不会单独保存或发送坐标及诊断记录。",
  },
} satisfies Record<Locale, Record<string, string>>;

export default function GpsDiagnosticsPanel({ fix, compassHeading, movementHeading, error, locale }: Props) {
  const [diagnostics, setDiagnostics] = useState(initialGpsDiagnostics);
  useEffect(() => {
    if (fix) setDiagnostics((previous) => updateGpsDiagnostics(previous, fix));
  }, [fix]);

  const t = LABELS[locale];
  const quality: GpsQuality = gpsQuality(diagnostics.lastAccuracyMeters);
  const status = diagnostics.received === 0 ? t.unknown :
    diagnostics.lastWasJump ? t.jump : error ? t.weak : t[quality];
  const heading = compassHeading !== null ? t.compass :
    movementHeading !== null ? t.movement : t.unavailable;

  return (
    <details className="gps-diagnostics">
      <summary>{t.title} · {status}</summary>
      <dl>
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
