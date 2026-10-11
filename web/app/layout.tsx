import type { Metadata, Viewport } from "next";
import { getServiceMetadata } from "../lib/i18n";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = getServiceMetadata("ko", "home");

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 지도를 두 손가락으로 확대할 수 있어야 해 maximumScale 은 걸지 않는다.
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
