import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vsolve/ui"],
  serverExternalPackages: ["@prisma/client", "@vsolve/db"],
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.local"],
};

export default nextConfig;
