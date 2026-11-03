/** Server configuration only. Request headers, paths, query strings and body never choose a database. */
export const WORLD_CUP_INSTALLATION = "mangwon-worldcup-market";
const WALK_PROJECT = "prj_oAKXh05oilzBd9h5CeMw6gcppSuq";
const MARKET_PROJECT = "prj_87r30cKYvuPS8oCu4ijAt34mrdqg";
// Non-secret reference verified from the existing WALK production configuration.
const EXISTING_WALK_DATABASE_REF = "vkmpitfvcmjqlugixsqo";
type Environment = Readonly<Record<string, string | undefined>>;
export type StorageIdentity = { productId: "walk"; installationId: null } |
  { productId: "knavi"; installationId: typeof WORLD_CUP_INSTALLATION };
export interface StorageTarget {
  readonly identity: StorageIdentity;
  readonly url: string;
  readonly key: string;
  readonly databaseProjectRef: string;
}
export function storageDeploymentIdentity(env: Environment = process.env): StorageIdentity | null {
  if (env.VERCEL_PROJECT_ID === WALK_PROJECT) return { productId: "walk", installationId: null };
  if (env.VERCEL_PROJECT_ID === MARKET_PROJECT) return { productId: "knavi", installationId: WORLD_CUP_INSTALLATION };
  if (env.VERCEL_PROJECT_ID) return null;
  // Explicit host-independent deployment binding; hosting model is not chosen here.
  if (env.STORAGE_PRODUCT === "walk") return { productId: "walk", installationId: null };
  if (env.STORAGE_PRODUCT === "knavi" && env.KNAVI_INSTALLATION_ID === WORLD_CUP_INSTALLATION) {
    return { productId: "knavi", installationId: WORLD_CUP_INSTALLATION };
  }
  return null;
}
export function resolveStorageTarget(env: Environment = process.env): StorageTarget | null {
  if (typeof window !== "undefined") return null;
  const identity = storageDeploymentIdentity(env);
  if (!identity) return null;
  const url = identity.productId === "walk" ? env.SUPABASE_URL : env.KNAVI_SUPABASE_URL;
  const key = identity.productId === "walk" ? env.SUPABASE_SERVICE_ROLE_KEY : env.KNAVI_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return null;
  const match = /^([a-z0-9-]+)\.supabase\.co$/.exec(parsed.hostname);
  if (!match) return null;
  const ref = match[1]!;
  if (identity.productId === "knavi") {
    if (env.KNAVI_INSTALLATION_ID !== identity.installationId || env.KNAVI_DATABASE_PROJECT_REF !== ref || ref === EXISTING_WALK_DATABASE_REF) return null;
    // Also reject a newly configured generic WALK target, without ever using its credentials.
    try { if (env.SUPABASE_URL && new URL(env.SUPABASE_URL).hostname === parsed.hostname) return null; } catch { return null; }
  }
  return { identity, url: parsed.origin, key, databaseProjectRef: ref };
}
export function storageHeaders(key: string): Record<string, string> {
  return { apikey: key, ...(key.startsWith("eyJ") ? { authorization: `Bearer ${key}` } : {}) };
}
/** Every K-Navi write verifies the target DB's immutable installation binding first. */
export async function verifyStorageIdentity(target: StorageTarget, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  if (target.identity.productId === "walk") return true; // Keep the existing standalone WALK schema unchanged.
  try {
    const response = await fetcher(`${target.url}/rest/v1/deployment_identity?select=product_id,installation_id&singleton=eq.true&limit=2`, {
      headers: storageHeaders(target.key), cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const rows: unknown = await response.json();
    return Array.isArray(rows) && rows.length === 1 && rows[0]?.product_id === target.identity.productId && rows[0]?.installation_id === target.identity.installationId;
  } catch { return false; }
}
export function bindStorageRow(target: StorageTarget, table: "events" | "qr_scans", row: object): object {
  if (target.identity.productId === "walk") return row;
  return { ...row, product_id: "knavi", installation_id: target.identity.installationId,
    ...(table === "events" ? { app: "worldcup-market" } : {}) };
}
