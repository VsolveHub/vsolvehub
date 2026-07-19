import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "apps/customer"),
  "@vsolve/db": path.resolve(__dirname, "packages/db/src/index.ts"),
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
          setupFiles: ["apps/customer/vitest.setup.ts"],
          include: ["{apps,packages}/**/*.{test,spec}.tsx"],
          exclude: ["**/node_modules/**", "**/.next/**"],
        },
      },
    ],
  },
});
