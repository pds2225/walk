import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertQrScan, insertSupabaseRow } from "./qrScan";
import { resolveStorageTarget, storageDeploymentIdentity, WORLD_CUP_INSTALLATION } from "./storageDeployment";
import { analyticsDiagnostics } from "./analyticsDiagnostics";
const walk = { STORAGE_PRODUCT: "walk", SUPABASE_URL: "https://walktest.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "walk-test-key" };
const market = { ...walk, STORAGE_PRODUCT: "knavi", KNAVI_INSTALLATION_ID: WORLD_CUP_INSTALLATION,
  KNAVI_DATABASE_PROJECT_REF: "markettest", KNAVI_SUPABASE_URL: "https://markettest.supabase.co", KNAVI_SUPABASE_SERVICE_ROLE_KEY: "market-test-key" };
beforeEach(() => { vi.stubEnv("VERCEL_PROJECT_ID", ""); for (const [k,v] of Object.entries(market)) vi.stubEnv(k,v); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("server-fixed deployment database routing", () => {
  it("records a failure unless a posted receipt can actually be read back", async () => {
    vi.stubEnv("STORAGE_PRODUCT", "walk");
    const before = analyticsDiagnostics.failed;
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 201 })).mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal("fetch", fetcher);
    expect(await insertSupabaseRow("events", { event: "nav_start", app: "walk" })).toBe(false);
    expect(analyticsDiagnostics.failed).toBe(before + 1);
    expect(fetcher.mock.calls[1]![0]).toContain("ingest_id=eq.");
  });
  it("uses platform project identity over a conflicting product setting, and rejects unknown deployments", () => {
    expect(storageDeploymentIdentity({ ...market, VERCEL_PROJECT_ID: "prj_oAKXh05oilzBd9h5CeMw6gcppSuq" })?.productId).toBe("walk");
    expect(storageDeploymentIdentity({ ...walk, VERCEL_PROJECT_ID: "prj_87r30cKYvuPS8oCu4ijAt34mrdqg" })?.installationId).toBe(WORLD_CUP_INSTALLATION);
    expect(resolveStorageTarget({ ...market, VERCEL_PROJECT_ID: "unknown" })).toBeNull();
    expect(resolveStorageTarget({})).toBeNull();
  });
  it("does not fall back to generic WALK credentials when installation settings are absent", () => {
    expect(resolveStorageTarget({ ...walk, STORAGE_PRODUCT: "knavi", KNAVI_INSTALLATION_ID: WORLD_CUP_INSTALLATION })).toBeNull();
    expect(resolveStorageTarget(walk)?.url).toBe(walk.SUPABASE_URL);
    expect(resolveStorageTarget(market)?.url).toBe(market.KNAVI_SUPABASE_URL);
  });
  it("rejects shared, mismatched, unknown installation and unsafe targets", () => {
    for (const patch of [
      { KNAVI_SUPABASE_URL: walk.SUPABASE_URL, KNAVI_DATABASE_PROJECT_REF: "walktest" },
      { KNAVI_SUPABASE_URL: "https://vkmpitfvcmjqlugixsqo.supabase.co", KNAVI_DATABASE_PROJECT_REF: "vkmpitfvcmjqlugixsqo" },
      { KNAVI_DATABASE_PROJECT_REF: "different" }, { KNAVI_INSTALLATION_ID: "another-building" },
      { KNAVI_SUPABASE_URL: "https://markettest.supabase.co/other" }, { KNAVI_SUPABASE_URL: "http://markettest.supabase.co" },
    ]) expect(resolveStorageTarget({ ...market, ...patch })).toBeNull();
  });
  it("verifies DB installation then inserts only server-bound attribution, ignoring row spoofing", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json([{ product_id: "knavi", installation_id: WORLD_CUP_INSTALLATION }]))
      .mockResolvedValueOnce(new Response(null, { status: 201 })).mockImplementation(async (url: string) => Response.json([{ ingest_id: new URL(url).searchParams.get("ingest_id")!.slice(3) }])); vi.stubGlobal("fetch",fetcher);
    expect(await insertSupabaseRow("events", { event: "store_view", app: "walk", product_id: "walk", installation_id: "other" })).toBe(true);
    expect(fetcher.mock.calls[0]![0]).toContain("markettest.supabase.co/rest/v1/deployment_identity");
    const [url,init] = fetcher.mock.calls[1]!;
    expect(url).toBe("https://markettest.supabase.co/rest/v1/events");
    expect(JSON.parse(init.body)).toMatchObject({ product_id: "knavi", installation_id: WORLD_CUP_INSTALLATION, app: "worldcup-market" });
  });
  it("never posts when DB identity is wrong, absent or unavailable", async () => {
    for (const response of [Response.json([{ product_id: "knavi", installation_id: "other-building" }]),Response.json([]),new Response(null,{status:404})]) {
      const fetcher=vi.fn().mockResolvedValue(response);vi.stubGlobal("fetch",fetcher);
      expect(await insertSupabaseRow("events",{event:"page_view"})).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0]![1].method).not.toBe("POST");
    }
  });
  it("keeps WALK's existing schema and destination unchanged", async () => {
    vi.stubEnv("STORAGE_PRODUCT","walk");const fetcher=vi.fn().mockImplementation(async (url: string) => url.includes("ingest_id=eq.") ? Response.json([{ingest_id: new URL(url).searchParams.get("ingest_id")!.slice(3)}]) : new Response(null,{status:201}));vi.stubGlobal("fetch",fetcher);
    expect(await insertSupabaseRow("events",{event:"search",app:"walk"})).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]![0]).toBe("https://walktest.supabase.co/rest/v1/events");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({event:"search",app:"walk"});
    expect(await insertQrScan({store_id:"worldcup-market-01",store_no:1,locale:"ko",src:"qr",visitor_id:null,user_agent:null,referrer:null,is_first_visit:null})).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
