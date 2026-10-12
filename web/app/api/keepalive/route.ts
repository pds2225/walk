/**
 * Daily keep-alive for the free Supabase project (pauses after inactivity).
 * Called by Vercel Cron (vercel.json, 19:00 UTC = 04:00 KST) with
 * "Authorization: Bearer $CRON_SECRET". Runs a real read on qr_scans.
 */
import { NextResponse } from "next/server";
import { pingQrScans } from "../../../lib/qrScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await pingQrScans();
  if (result === "unconfigured") return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
  if (result === "error") return NextResponse.json({ ok: false }, { status: 502 });
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
