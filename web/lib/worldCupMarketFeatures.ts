/** Presentation-only flag. Navigation targets and walking code remain unchanged. */
export function worldCupMarketWalkingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED === "true";
}

/** NAVER Maps JS 실시간 지도는 기본 꺼짐. 빌드 전에 `NEXT_PUBLIC_WORLDCUP_LIVE_MAP=true`로 다시 켠다. */
export function worldCupMarketLiveMapEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WORLDCUP_LIVE_MAP === "true";
}
