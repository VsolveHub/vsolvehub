import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are shipped as TS source; let Next compile them.
  transpilePackages: ["@vsolve/ui", "@vsolve/config"],
  // Prisma must stay external to the server bundle (Next 15 top-level key).
  serverExternalPackages: ["@prisma/client", "@vsolve/db"],
  experimental: {
    // KYC uploads (Server Actions) carry document images. The default 1 MB cap
    // rejects them before our own 5 MB validation runs — surfacing Next's opaque
    // "Body exceeded 1 MB limit" error. Lift it to comfortably fit our uploads.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
