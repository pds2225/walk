/** 프로세스 수명 동안의 진단값이다. 재시작/다른 인스턴스의 이력을 대표하지 않는다. */
export const analyticsDiagnostics = { attempted: 0, readbackConfirmed: 0, failed: 0, lastFailureAt: null as string | null };
export function recordStorageResult(confirmed: boolean) {
  analyticsDiagnostics.attempted += 1;
  if (confirmed) analyticsDiagnostics.readbackConfirmed += 1;
  else { analyticsDiagnostics.failed += 1; analyticsDiagnostics.lastFailureAt = new Date().toISOString(); }
}
export function serverTraffic() {
  if (process.env.ANALYTICS_TRAFFIC_TYPE === "test") return { traffic_type: "test", traffic_evidence: "server-test-setting" };
  if (process.env.VERCEL_ENV === "production") return { traffic_type: "production", traffic_evidence: "vercel-production-deployment" };
  if (process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development") return { traffic_type: "test", traffic_evidence: "vercel-nonproduction-deployment" };
  return { traffic_type: "unknown", traffic_evidence: null };
}
