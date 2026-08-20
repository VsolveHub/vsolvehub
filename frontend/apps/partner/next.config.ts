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
      // Development only. A full URL carries the query string, which on this
      // API means address ids, service-area ids and phone-number-derived paths.
      // Those belong in a developer's terminal, never in a production log line
      // that ships to an aggregator.
      fullUrl: process.env.NODE_ENV !== "production",
    },
  },
  async redirects() {
    return [
      { source: "/dashboard", destination: "/work", permanent: true },
      { source: "/workforce", destination: "/work", permanent: true },
      { source: "/projects", destination: "/work", permanent: true },
      { source: "/jobs", destination: "/work", permanent: true },
      { source: "/jobs/:bookingId", destination: "/work/jobs/:bookingId", permanent: true },
      { source: "/workforce/offers", destination: "/work", permanent: true },
      { source: "/offers", destination: "/work", permanent: true },
      { source: "/workforce/enquiries", destination: "/work", permanent: true },
      { source: "/workforce/enquiries/:invitationId", destination: "/work/enquiries/:invitationId", permanent: true },
      { source: "/projects/enquiries", destination: "/work", permanent: true },
      { source: "/projects/enquiries/:invitationId", destination: "/work/enquiries/:invitationId", permanent: true },
      { source: "/projects/enquiries/:invitationId/estimate", destination: "/work/enquiries/:invitationId/estimate", permanent: true },
      { source: "/workforce/shifts", destination: "/work", permanent: true },
      { source: "/workforce/shifts/:engagementId", destination: "/work/jobs/:engagementId", permanent: true },
      { source: "/workforce/shifts/:engagementId/days/:stageId", destination: "/work/jobs/:engagementId/days/:stageId", permanent: true },
      { source: "/projects/stages", destination: "/work", permanent: true },
      { source: "/projects/stages/:engagementId", destination: "/work/jobs/:engagementId", permanent: true },
      { source: "/workforce/crew", destination: "/me/crew", permanent: true },
      { source: "/earnings", destination: "/money", permanent: true },
      { source: "/profile", destination: "/me", permanent: true },
      { source: "/availability", destination: "/me", permanent: true },
    ];
  },
};

export default nextConfig;
