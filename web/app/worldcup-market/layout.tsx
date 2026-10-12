import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServiceMetadata } from "../../lib/i18n";

const marketMetadata = getServiceMetadata("ko", "worldcup-market");

export const metadata: Metadata = {
  ...marketMetadata,
  applicationName: "케이트립 K-Trip",
  openGraph: {
    title: marketMetadata.title,
    description: marketMetadata.description,
    siteName: "케이트립 K-Trip",
    locale: "ko_KR",
    alternateLocale: ["en_US", "ja_JP", "zh_CN"],
    type: "website",
    url: "/worldcup-market",
  },
  twitter: { card: "summary", title: marketMetadata.title, description: marketMetadata.description },
};

export default function WorldCupMarketLayout({ children }: { children: ReactNode }) {
  return children;
}
