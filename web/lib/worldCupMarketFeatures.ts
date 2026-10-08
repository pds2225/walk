/** Presentation-only flag. Navigation targets and walking code remain unchanged. */
export function worldCupMarketWalkingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED === "true";
}
