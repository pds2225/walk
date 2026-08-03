import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // 테스트는 빌드 산출물(dist)이 아니라 소스를 본다 — 빌드를 먼저 돌려야만
      // 테스트가 도는 상황을 만들지 않기 위해서다.
      "@walk/route-engine": fileURLToPath(new URL("./packages/route-engine/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "web/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
});
