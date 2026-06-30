import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are shipped as TS source; let Next compile them.
  transpilePackages: ["@vsolve/ui", "@vsolve/config"],
  // Prisma must stay external to the server bundle (Next 15 top-level key).
  serverExternalPackages: ["@prisma/client", "@vsolve/db"],
};

export default nextConfig;
