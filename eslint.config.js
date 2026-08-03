import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".pytest_cache/**",
      "**/.pytest_cache/**",
      "__pycache__/**",
      "**/__pycache__/**",
      ".venv/**",
      "package-lock.json",
      "eslint.config.js",
      // 루트 tsconfig(packages 전용) 밖이라 타입 정보를 못 붙인다
      "vitest.config.ts",
      // 빌드 산출물 — 소스를 이미 검사한다
      "**/dist/**",
      "web/.next/**",
      // Next.js 앱은 자체 tsconfig(DOM·JSX)를 쓴다. 여기 규칙(node 전용 project)으로
      // 끌어들이면 타입 정보가 안 맞아 파서가 죽는다 — `npm run next:build` 가 타입체크한다.
      "web/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
    },
  }
);
