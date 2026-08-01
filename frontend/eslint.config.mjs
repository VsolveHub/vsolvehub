import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["packages/ui/src/logo.tsx"],
    rules: {
      // The shared UI package is framework-agnostic and cannot import
      // next/image. Each app supplies the same small local brand asset.
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    "**/node_modules/**",
    "packages/api-client/src/generated/**",
  ]),
]);
