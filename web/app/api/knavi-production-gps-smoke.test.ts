import { expect, it } from "vitest";

/**
 * ONE-OFF production HTTP smoke. NEVER merge this file.
 * Only a CI run on this dedicated QA branch can execute it.
 * Sends 2 synthetic locations to the new GPS-only table, for later deletion
 * by their exact test session & navigation ID. It does not touch existing events/QR.
 */
const onQaBranch =
  process.env.GITHUB_HEAD_REF === "test/knavi-live-gps-http-20261114" ||
  process.env.GITHUB_REF_NAME === "test/knavi-live-gps-http-20261114";

const fixture = {
  store_id: "worldcup-market-01",
  navigation_id: "4f98a25c-61df-4b68-9a2f-7b2d8ab9b65f",
  session_id: "qa-synthetic-20261114-1759",
  path: "/worldcup-market",
  geo_consent: true,
  accuracy_m: 12,
};
const base = "https://k-navi-eight.vercel.app";

it.skipIf(!onQaBranch)("operational HTTPS POST two synthetic fixes, then same visitor HTTPS GET DB readback", async () => {
  const payloads = [
    { ...fixture, event: "nav_start", lat: 37.5587, lng: 126.9051 },
    { ...fixture, event: "nav_progress", lat: 37.5589, lng: 126.9053 },
  ];
  let browserCookie: string | null = null;

  for (const [index, payload] of payloads.entries()) {
    const res = await fetch(`${base}/api/track`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(browserCookie ? { cookie: browserCookie } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(18000),
    });
    // Never print cookies, tokens or GPS coordinates in CI logs.
    expect(res.status, `production POST #${index+1} expected HTTP 201, got ${res.status}`).toBe(201);
    const reply: unknown = await res.json();
    expect(reply).toMatchObject({ ok: true, storage: "persisted", gps_stored: true });
    if (index === 0) {
      const cookieMatch = res.headers.get("set-cookie")?.match(/ktrip_vid=[A-Za-z0-9-]+/);
      expect(cookieMatch, "first POST must set a first-party visitor cookie").toBeTruthy();
      browserCookie = cookieMatch![0];
    }
  }

  expect(browserCookie).toBeTruthy();
  const readback = await fetch(`${base}/api/storage-status?nav=1`, {
    method: "GET",
    headers: { cookie: browserCookie! },
    signal: AbortSignal.timeout(18000),
  });
  expect(readback.status).toBe(200);
  const status: unknown = await readback.json();
  expect(status).toMatchObject({
    ok: true,
    status: "storage_connected",
    recent_market_navigation_events_saved: true,
    recent_market_navigation_gps_saved: true,
  });
  const text = JSON.stringify(status);
  expect(text).not.toContain(fixture.navigation_id);
  expect(text).not.toContain("37.5587");
}, 65000);
