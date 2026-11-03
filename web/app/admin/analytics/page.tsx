"use client";
import { useEffect, useState, type FormEvent } from "react";
import "./analytics.css";

interface Data {
  total: number; pageSize: number;
  filters: { from: string; to: string; page: number };
  rows: Array<Record<string, unknown>>;
  summary: { eventCount: number; visitors: number; sessions: number; navStartEvents: number; arrivalEvents: number; reroutes: number;
    identifiedNavigations: number; matchedArrivalNavigations: number; eventArrivalRatio: number | null; unknownTraffic: number;
    missingNavigationIds: number; duplicateStartEvents: number; arrivalWithoutStart: number;
    daily: Array<{ date: string; count: number }>; stores: Array<Record<string, string | number>>; notes: string[] };
  diagnostics: { scope: string; attempted: number; readbackConfirmed: number; failed: number; databaseReadback: string };
}
export default function AnalyticsAdmin() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  async function load(params = "") {
    setBusy(true); setError(""); setData(null);
    try {
      const response = await fetch(`/api/admin/analytics?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (response.status === 401) { setAuthenticated(false); return; }
      setAuthenticated(true);
      if (!response.ok) throw new Error(body.error ?? "조회 실패");
      setData(body as Data); setQuery(params);
    } catch (e) { setError(e instanceof Error ? e.message : "조회 실패"); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = event.currentTarget, password = new FormData(form).get("password");
    form.reset();
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error ?? "로그인 실패"); }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "로그인 실패"); }
    finally { setBusy(false); }
  }
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, name) => { if (value) params.set(name, String(value)); });
    void load(params.toString());
  }
  function page(value: number) { const params = new URLSearchParams(query); params.set("page", String(value)); void load(params.toString()); }
  return <main className="analytics-admin">
    <header><div><p className="admin-eyebrow">WALK · 운영 분석</p><h1>이용 흐름과 수집 상태</h1><p>기록으로 확인되는 것만 표시합니다. 날짜는 한국시간 기준입니다.</p></div>
      {authenticated && <button onClick={async () => { await fetch("/api/admin/session", { method: "DELETE" }); setAuthenticated(false); setData(null); }}>로그아웃</button>}</header>
    {error && <p className="admin-error" role="alert">{error} · 미수집·연결 오류를 0건으로 표시하지 않습니다.</p>}
    {authenticated === false && <section className="admin-login"><h2>관리자 로그인</h2><p>허가된 관리자만 로그와 CSV에 접근할 수 있습니다.</p>
      <form onSubmit={login}><label>관리자 비밀번호<input name="password" type="password" autoComplete="current-password" required maxLength={512} /></label><button disabled={busy}>로그인</button></form></section>}
    {authenticated && <>
      <form className="admin-filters" onSubmit={filter}>
        <label>시작일 (KST)<input type="date" name="from" defaultValue={data?.filters.from} /></label>
        <label>종료일 (KST)<input type="date" name="to" defaultValue={data?.filters.to} /></label>
        <label>앱<select name="app"><option value="all">전체</option><option value="walk">WALK</option><option value="worldcup-market">월드컵시장</option></select></label>
        <label>공간<select name="space"><option value="all">전체</option><option value="mangwon-worldcup-market">월드컵시장</option><option value="general">일반 WALK</option></select></label>
        <label>트래픽 근거<select name="traffic"><option value="all">전체</option><option value="production">운영 배포 출처</option><option value="test">테스트 출처</option><option value="unknown">미분류</option></select></label>
        <label>점포<select name="store"><option value="">전체 점포</option>{Array.from({ length: 45 }, (_, i) => { const no = String(i + 1).padStart(2, "0"); return <option key={no} value={`worldcup-market-${no}`}>{no}번</option>; })}</select></label>
        <label>이벤트 / 점포 ID<input name="q" placeholder="nav_start 또는 market-23" maxLength={64} pattern="[a-zA-Z0-9_-]*" /></label>
        <label>정렬<select name="sort"><option value="created_at">시각</option><option value="event">이벤트</option><option value="store_no">점포 번호</option></select></label>
        <label>순서<select name="direction"><option value="desc">내림차순</option><option value="asc">오름차순</option></select></label>
        <button disabled={busy}>조회</button>
      </form>
      {data && <>
        <section className="admin-kpis" aria-label="개요 지표">{[
          ["조회 이벤트", data.summary.eventCount], ["방문자 별칭", data.summary.visitors], ["탭 세션 별칭", data.summary.sessions],
          ["보행 시작 이벤트", data.summary.navStartEvents], ["도착 이벤트", data.summary.arrivalEvents], ["재탐색 이벤트", data.summary.reroutes],
        ].map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}</section>
        <section className="admin-quality"><h2>해석 전 확인</h2>
          <p>식별된 보행 {data.summary.identifiedNavigations}건 · 시작과 연결된 도착 {data.summary.matchedArrivalNavigations}건 · 이벤트 도착 비율 {data.summary.eventArrivalRatio === null ? "계산 불가" : `${(data.summary.eventArrivalRatio * 100).toFixed(1)}%`}</p>
          <p>미분류 {data.summary.unknownTraffic}건 · 보행 ID 누락 {data.summary.missingNavigationIds}건 · 중복 시작 {data.summary.duplicateStartEvents}건 · 시작 미확인 도착 {data.summary.arrivalWithoutStart}건</p>
          {data.summary.notes.map((note) => <p key={note}>{note}</p>)}</section>
        <section><h2>일별 기록</h2><div className="admin-trend">{data.summary.daily.map((day) => <div key={day.date}><span>{day.date}</span><meter min={0} max={Math.max(...data.summary.daily.map((d) => d.count), 1)} value={day.count} /><strong>{day.count}</strong></div>)}</div>{data.summary.daily.length === 0 && <p>조회 조건에 맞는 기록이 없습니다.</p>}</section>
        <section><h2>점포별 이벤트</h2><div className="admin-table"><table><thead><tr>{["점포", "QR 링크 요청", "QR 랜딩 조회", "상세조회", "길찾기 클릭", "보행 시작", "도착 이벤트"].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{data.summary.stores.map((store) => <tr key={String(store.store_id)}>{["store_id", "qr_link_request", "qr_landing", "store_view", "directions", "nav_start", "arrive"].map((key) => <td key={key}>{store[key]}</td>)}</tr>)}</tbody></table></div></section>
        <section><div className="admin-section-title"><h2>원본 이벤트 · {data.total}건</h2><a href={`/api/admin/analytics?${query}&format=csv`}>좌표 제외 CSV 내려받기</a></div>
          <div className="admin-table"><table><thead><tr>{["시각 (KST)", "앱", "이벤트", "점포", "유입", "보행 ID", "분류"].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{data.rows.map((row) => <tr key={`${row.table}-${row.id}`}>{[
            new Date(String(row.created_at)).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }), row.app, row.event, row.store_no ?? "—", row.src ?? "—", row.navigation_id ?? "미수집", row.traffic_type,
          ].map((value, i) => <td key={i}>{String(value)}</td>)}</tr>)}</tbody></table></div>
          <nav aria-label="로그 페이지"><button disabled={busy || data.filters.page <= 1} onClick={() => page(data.filters.page - 1)}>이전</button><span>{data.filters.page} / {Math.max(1, Math.ceil(data.total / 50))} · 50행씩</span><button disabled={busy || data.filters.page * 50 >= data.total} onClick={() => page(data.filters.page + 1)}>다음</button></nav>
        </section>
        <details><summary>수집 진단</summary><p>DB 조회: {data.diagnostics.databaseReadback}</p><p>현재 서버 인스턴스: 저장 시도 {data.diagnostics.attempted} · DB 재조회 확인 {data.diagnostics.readbackConfirmed} · 실패 {data.diagnostics.failed}</p><p>이 카운터는 재시작 때 초기화되며 전체 운영 이력이 아닙니다. 202는 저장 완료가 아닙니다.</p></details>
      </>}
    </>}
    {busy && <p role="status">불러오는 중…</p>}
  </main>;
}
