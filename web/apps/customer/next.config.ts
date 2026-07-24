import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

// pnpm workspace root (web/). Turbopack otherwise infers a root from the nearest
// lockfile and can pick the wrong one in a monorepo.
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@vsolve/ui"],
  // `next dev --turbopack` reads this; `next build` still goes through the
  // webpack config below. Declaring it also silences Next's "Webpack is
  // configured while Turbopack is not" warning.
  turbopack: { root: workspaceRoot },
  serverExternalPackages: ["@prisma/client", "@vsolve/db"],
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  // Tree-shake large icon/utility barrels so a page only ships the icons it uses.
  experimental: {
    optimizePackageImports: ["@flaticon/flaticon-uicons"],
  },
  // Strip console.* from production bundles (keep warnings/errors for triage).
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  // Allow next/image to optimize the remote hosts the app actually uses, and
  // serve modern formats. Without this, remote <img> render at full weight.
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
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
