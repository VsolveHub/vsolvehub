import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// pnpm workspace root (frontend/). Turbopack otherwise infers a root from the
// nearest lockfile and can pick the wrong one in a monorepo.
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  // Workspace packages are shipped as TS source; let Next compile them.
  transpilePackages: ["@vsolve/ui", "@vsolve/config", "@vsolve/api-client", "@vsolve/query"],
  // Next 16 defaults to Turbopack, which forks a worker per CPU and OOM-kills
  // this 16GB laptop during the first route compile. Webpack stays in one
  // process. Keep turbopack.root for production builds / explicit --turbopack.
  experimental: { cpus: 1 },
  turbopack: { root: workspaceRoot },
  logging: {
    fetches: {
      // Development only. A full URL carries the query string, which on this
      // API means address ids, service-area ids and phone-number-derived paths.
      // Those belong in a developer's terminal, never in a production log line
      // that ships to an aggregator.
      fullUrl: process.env.NODE_ENV !== "production",
    },
  },
};

export default nextConfig;
