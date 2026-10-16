import type { NextConfig } from "next";

/** Free Vercel subdomain for the Worldcup Market (Dasom 2026-10-16). Its root lands on the market page;
 *  k-navi.vercel.app/ stays the WALK nav. /q/N works on any host and redirects on the same host. */
export const WORLDCUP_MARKET_HOST = "worldcup-market-seoul.vercel.app";

const config: NextConfig = {
  typedRoutes: true,
  async redirects() {
    return [
      { source: "/", has: [{ type: "host", value: WORLDCUP_MARKET_HOST }], destination: "/worldcup-market", permanent: false },
    ];
  },
};

export default config;
