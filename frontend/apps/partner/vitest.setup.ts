import "@testing-library/jest-dom/vitest";

/**
 * DOM matchers for the Partner app's component tests.
 *
 * The import is not only a runtime registration — it is what augments Vitest's
 * `Assertion` interface, so `toBeInTheDocument` type-checks. Without a file like
 * this inside the app's own `tsconfig` include, `pnpm test` passes while
 * `pnpm typecheck` fails on every DOM assertion, which is a confusing way to
 * find out.
 */
