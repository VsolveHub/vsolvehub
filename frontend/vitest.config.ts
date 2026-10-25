import { defineConfig, type Plugin } from "vitest/config";
import path from "node:path";

/**
 * Resolves `@/…` against the app the importing file belongs to.
 *
 * Each app's `tsconfig` maps `@/*` to its own root, so the same specifier means
 * three different things depending on who wrote it. A single static alias can
 * only pick one, and picking Customer meant a Partner component was resolvable
 * exactly as far as the modules that happen to exist under both names —
 * `lib/api/browser` did, `features/application/*` did not, and `features/catalog`
 * and `features/session` exist in both apps and would have silently resolved to
 * the wrong one.
 *
 * Deriving the root from the importer reproduces what each app's build does, so
 * a test exercises the module its app actually ships.
 */
function appScopedAlias(root: string): Plugin {
  return {
    name: "vsolve:app-scoped-alias",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!source.startsWith("@/") || !importer) return null;
      const app = importer.replace(/\\/g, "/").match(/\/apps\/([^/]+)\//)?.[1];
      if (!app) return null;

      // Delegated so Vite still applies extension resolution and index files.
      const resolved = await this.resolve(
        path.resolve(root, "apps", app, source.slice(2)),
        importer,
        { skipSelf: true },
      );
      return resolved?.id ?? null;
    },
  };
}

const alias = {
  // The real `server-only` throws on import so that server code leaking into a
  // client bundle fails the build. There is no bundle under Vitest, so it is
  // stubbed to keep server modules testable.
  "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
};

const plugins = [appScopedAlias(__dirname)];

export default defineConfig({
  plugins,
  resolve: { alias },
  esbuild: { jsx: "automatic" },
  test: {
    projects: [
      {
        plugins,
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["{apps,packages}/**/*.{test,spec}.ts"],
          exclude: ["**/node_modules/**", "**/.next/**"],
        },
      },
      {
        plugins,
        resolve: { alias },
        esbuild: { jsx: "automatic" },
        test: {
          name: "jsdom",
          environment: "jsdom",
          globals: true,
          // One list for every jsdom test, regardless of which app it belongs
          // to. Each app keeps its own file because the import is what augments
          // the `Assertion` type inside that app's `tsconfig` — a shared setup
          // would run fine and still fail `typecheck` in the app without one.
          setupFiles: [
            "apps/customer/vitest.setup.ts",
            "apps/partner/vitest.setup.ts",
            "apps/admin/vitest.setup.ts",
          ],
          include: ["{apps,packages}/**/*.{test,spec}.tsx"],
          exclude: ["**/node_modules/**", "**/.next/**"],
        },
      },
    ],
  },
});
