"use client";
import { useEffect, useState } from "react";

type Status = { available: boolean; consented: boolean; recipient?: string; notice_version?: string };
export default function AihowsLocationConsent() {
  const [status, setStatus] = useState<Status | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void fetch("/api/aihows-consent", { cache: "no-store" }).then(r => r.json()).then(setStatus).catch(() => setMessage("동의 상태를 확인할 수 없습니다.")); }, []);
  async function save(action: "grant" | "revoke") {
    if (!status?.available || busy || (action === "grant" && !checked)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/aihows-consent", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, notice_version: status.notice_version }) });
      if (!response.ok) throw new Error("save failed");
      const next = await response.json();
      setStatus({ ...status, consented: next.consented === true });
      setChecked(false);
      setMessage(action === "grant" ? "별도 제3자 제공 동의가 기록되었습니다." : "제3자 제공 동의를 철회했습니다. 향후 제공이 중단됩니다.");
    } catch { setMessage("저장에 실패했습니다. 동의가 완료된 것으로 처리하지 않습니다."); }
    finally { setBusy(false); }
  }
  return (
    <section aria-label="AIHows 위치정보 제3자 제공 선택 동의" style={{ maxWidth: 680, margin: "16px auto", padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
      <h2>선택: AIHows 위치정보 제3자 제공 동의</h2>
      <p>이 동의는 기존 지도·길찾기 이용 및 위치정보 수집 동의와 별개입니다. 거부해도 기본 서비스를 이용할 수 있습니다.</p>
      <p>제공받는 자: {status?.recipient ?? "법인 정보 확인 중"} / 목적: 망원 월드컵시장 방문·이동 PoC 분석</p>
      <p>제공 항목: 동의 이후 수집된 위치 좌표(위도·경도), 정확도, 기록 시각, 내부 방문객 식별자 및 관련 점포 식별자</p>
      <p>보유·이용 기간: 제공받은 날부터 최대 1년, 목적 달성 또는 철회 시 관련 법령에 따라 더 이른 파기·처리 중단</p>
      <p>기존 동의 이전의 위치기록은 소급 제공하지 않습니다. 제3자 제공 동의는 언제든 철회할 수 있습니다.</p>
      {!status?.available ? <p role="status">현재 수령기관의 법인정보 또는 동의 기록 서버가 준비되지 않아 동의를 받을 수 없습니다.</p> :
        status.consented ? <button type="button" disabled={busy} onClick={() => void save("revoke")}>제3자 제공 동의 철회</button> :
        <>
          <label style={{ display: "block", marginBottom: 12 }}>
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
            위 제3자 제공 내용을 확인하고 선택적으로 동의합니다.
          </label>
          <button type="button" disabled={!checked || busy} onClick={() => void save("grant")}>별도 제공 동의</button>
        </>
      }
      {message && <p role="status">{message}</p>}
    </section>
  );
}
