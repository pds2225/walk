/** Walking is public by default; explicit false remains an emergency off switch. */
export function worldCupMarketWalkingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED !== "false";
}

/** NAVER Maps JS 실시간 지도는 기본 꺼짐. 빌드 전에 `NEXT_PUBLIC_WORLDCUP_LIVE_MAP=true`로 다시 켠다. */
export function worldCupMarketLiveMapEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WORLDCUP_LIVE_MAP === "true";
}
