import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["{apps,packages}/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/customer"),
      "@vsolve/db": path.resolve(__dirname, "packages/db/src/index.ts"),
    },
  },
});
