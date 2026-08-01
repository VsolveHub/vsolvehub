import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// pnpm workspace root (frontend/). Turbopack otherwise infers a root from the
// nearest lockfile and can pick the wrong one in a monorepo.
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  // Workspace packages are shipped as TS source; let Next compile them.
  transpilePackages: ["@vsolve/ui", "@vsolve/config", "@vsolve/api-client", "@vsolve/query"],
  // Next 16 uses Turbopack for development and production by default.
  turbopack: { root: workspaceRoot },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  experimental: {
    // KYC uploads carry document images. The default 1 MB Server Action body
    // cap rejects them before our own validation runs.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
