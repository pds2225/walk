import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 테스트는 빌드 산출물(dist)이 아니라 소스를 본다 — 빌드를 먼저 돌려야만
      // 테스트가 도는 상황을 만들지 않기 위해서다.
      "@walk/route-engine": fileURLToPath(new URL("./packages/route-engine/src/index.ts", import.meta.url)),
    },
  },
  test: {
    // 환경은 파일별로 지정한다(`// @vitest-environment jsdom`) — 대부분의 기존
    // 테스트는 순수 함수 테스트라 jsdom 이 필요 없다.
    include: ["packages/**/*.test.ts", "web/**/*.test.ts", "web/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
});
