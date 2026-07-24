import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

// pnpm workspace root (web/). Turbopack otherwise infers a root from the nearest
// lockfile and can pick the wrong one in a monorepo.
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  // Workspace packages are shipped as TS source; let Next compile them.
  transpilePackages: ["@vsolve/ui", "@vsolve/config"],
  // `next dev --turbopack` reads this; `next build` still goes through the
  // webpack config below. Declaring it also silences Next's "Webpack is
  // configured while Turbopack is not" warning.
  turbopack: { root: workspaceRoot },
  // Prisma must stay external to the server bundle (Next 15 top-level key).
  serverExternalPackages: ["@prisma/client", "@vsolve/db"],
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  // Copy the Prisma query engine next to the server bundle. In a pnpm monorepo
  // Next's bundler otherwise omits it, causing "Query Engine not found" on Vercel.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }
    return config;
  },
};

export default nextConfig;
