import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServiceMetadata } from "../../lib/i18n";

export const metadata: Metadata = getServiceMetadata("ko", "worldcup-market");

export default function WorldCupMarketLayout({ children }: { children: ReactNode }) {
  return children;
}
