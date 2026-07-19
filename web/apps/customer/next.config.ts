import type { NextConfig } from "next";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const nextConfig: NextConfig = {
  transpilePackages: ["@vsolve/ui"],
  serverExternalPackages: ["@prisma/client", "@vsolve/db"],
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.local"],
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
