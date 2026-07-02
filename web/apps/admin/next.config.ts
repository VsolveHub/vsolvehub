import type { NextConfig } from "next";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const nextConfig: NextConfig = {
  // Workspace packages are shipped as TS source; let Next compile them.
  transpilePackages: ["@vsolve/ui", "@vsolve/config"],
  // Prisma must stay external to the server bundle (Next 15 top-level key).
  serverExternalPackages: ["@prisma/client", "@vsolve/db"],
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
