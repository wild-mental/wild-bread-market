import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // 타입 정보를 쓰는 규칙. 타입을 봐야만 잡히는 것(떠 있는 Promise, 불필요한 await,
  // 잘못된 조건식)을 담당한다. 프로젝트 서비스로 tsconfig를 자동으로 물린다.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // 복잡도·중복·버그 패턴. 타입 검사와 겹치지 않는 축을 본다.
  sonarjs.configs.recommended,

  // 설정·스크립트는 타입 기반 규칙 대상에서 제외한다(tsconfig include 밖이라
  // 타입 정보를 만들 수 없다). 규칙을 끄는 것이 아니라 파서 범위를 맞추는 것이다.
  {
    files: ["**/*.mjs", "**/*.js", "**/*.cjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 정적 픽스처 — 검사 대상 코드가 아니다.
    "scripts/fixtures/**",
  ]),
]);

export default eslintConfig;
