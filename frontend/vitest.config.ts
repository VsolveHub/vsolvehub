import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "apps/customer"),
  // The real `server-only` throws on import so that server code leaking into a
  // client bundle fails the build. There is no bundle under Vitest, so it is
  // stubbed to keep server modules testable.
  "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
};

export default defineConfig({
  resolve: { alias },
  esbuild: { jsx: "automatic" },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["{apps,packages}/**/*.{test,spec}.ts"],
          exclude: ["**/node_modules/**", "**/.next/**"],
        },
      },
      {
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
          setupFiles: ["apps/customer/vitest.setup.ts", "apps/partner/vitest.setup.ts"],
          include: ["{apps,packages}/**/*.{test,spec}.tsx"],
          exclude: ["**/node_modules/**", "**/.next/**"],
        },
      },
    ],
  },
});
