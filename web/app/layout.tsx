import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "walk — 도보 내비게이션",
  description: "목적지를 넣고 걷기만 누르면 되는 도보 길안내",
};

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
