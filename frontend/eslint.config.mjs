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
    /**
     * The M2 screen surfaces may not name a colour.
     *
     * Twenty-eight screens were built by nine agents working in parallel, and
     * the one defect that survives every code review is a hex that is one digit
     * off the token. `bg-action` cannot drift; `#f87000` can, and did — the
     * customer catalogue already carries three different oranges (#f87000,
     * #EA580C, #C2410C) because nothing stopped it.
     *
     * Scoped deliberately to the folders this milestone rebuilt, all of which
     * measured zero raw hex when the rule went in. Widening it to the whole repo
     * is a separate, mechanical pass; doing it here would have meant fixing the
     * catalogue's palette inside a screen-build commit.
     *
     * Escape hatch: none by design. A colour the tokens cannot express is a
     * missing token — add it to packages/ui/src/tokens.css, where the contrast
     * test can see it.
     */
    files: [
      "apps/customer/features/project-request/**/*.{ts,tsx}",
      "apps/customer/features/quotes/**/*.{ts,tsx}",
      "apps/partner/features/proposal/**/*.{ts,tsx}",
      "apps/partner/features/enquiry/**/*.{ts,tsx}",
      "apps/partner/features/visit/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/]",
          message:
            "No raw hex colours here. Use a semantic token (bg-action, text-text-muted, border-line). A colour the tokens cannot express is a missing token — add it to packages/ui/src/tokens.css.",
        },
        {
          selector:
            "TemplateElement[value.raw=/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/]",
          message:
            "No raw hex colours here, including inside template literals. Use a semantic token from packages/ui/src/tokens.css.",
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
