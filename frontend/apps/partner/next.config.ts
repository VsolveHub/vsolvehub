import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// pnpm workspace root (frontend/). Turbopack otherwise infers a root from the
// nearest lockfile and can pick the wrong one in a monorepo.
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const isDev = process.env.NODE_ENV !== "production";

/**
 * Where the dev proxy forwards API calls.
 *
 * Only consulted in development — see `rewrites` below.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8000";

/**
 * Origins allowed to drive this dev server from another host.
 *
 * Next refuses cross-origin development requests unless the origin is listed —
 * without this a tunnelled or LAN-served dev session fails on HMR and RSC
 * fetches rather than rendering. Wildcards cover the usual tunnels so testing on
 * a real phone does not need a config edit and a restart every time the tunnel
 * hands out a new subdomain; `NEXT_PUBLIC_DEV_ORIGINS` takes a comma-separated
 * list for anything else.
 *
 * Development only. Next ignores this in a production build, and it must never
 * become the way a deployed origin is trusted.
 */
const devOrigins = [
  "*.ngrok-free.dev",
  "*.ngrok-free.app",
  "*.ngrok.io",
  "*.devtunnels.ms",
  "*.trycloudflare.com",
  "*.loca.lt",
  // The LAN address a phone on the same wifi would use.
  "192.168.*.*",
  "10.*.*.*",
  ...(process.env.NEXT_PUBLIC_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

const nextConfig: NextConfig = {
  // Workspace packages are shipped as TS source; let Next compile them.
  transpilePackages: ["@vsolve/ui", "@vsolve/config", "@vsolve/api-client", "@vsolve/query"],
  allowedDevOrigins: devOrigins,
  skipTrailingSlashRedirect: true,
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
  /**
   * The API, served from this app's own origin in development.
   *
   * The browser client calls `NEXT_PUBLIC_API_BASE_URL`, which defaults to
   * `http://localhost:8000` — correct on the machine running both servers and
   * useless anywhere else, because on a partner's phone `localhost` is the
   * phone. Setting that variable to an empty string makes the client emit
   * **relative** URLs, and these rewrites forward them to Django. One tunnel
   * then serves the app and the API together.
   *
   * Same-origin is not merely convenient here. The session is a cookie, and a
   * cross-site cookie needs `SameSite=None; Secure` and is dropped outright by
   * iOS Safari's tracking prevention in enough configurations that "it works on
   * my laptop, not on my phone" is the normal outcome. Proxying makes the cookie
   * first-party, which is what it is in production anyway. A partner losing
   * their session mid-job is the failure this avoids.
   *
   * **Development only.** In production the browser talks to the API's real
   * origin: a proxy there would put every API call through the Next server for
   * no reason, and hide CORS and cookie misconfiguration until the day the proxy
   * is removed.
   */
  async rewrites() {
    if (!isDev) return [];
    return [
      { source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*/` },
      // KYC documents and job evidence are served by Django in development.
      { source: "/media/:path*", destination: `${apiProxyTarget}/media/:path*` },
    ];
  },
  async redirects() {
    /*
      Every list route below lands on `/work/all`, not `/work`.

      They were all indexes — a workspace home, an offer inbox, an enquiry
      list — so the list is what they meant. `/work` itself now 308s to
      `/home`, and pointing these at it would both send somebody looking for a
      list to a status screen and cost a second hop to get anywhere.
    */
    return [
      { source: "/dashboard", destination: "/home", permanent: true },
      { source: "/workforce", destination: "/work/all", permanent: true },
      { source: "/projects", destination: "/work/all", permanent: true },
      { source: "/jobs", destination: "/work/all", permanent: true },
      { source: "/jobs/:bookingId", destination: "/work/jobs/:bookingId", permanent: true },
      { source: "/workforce/offers", destination: "/work/all", permanent: true },
      { source: "/offers", destination: "/work/all", permanent: true },
      { source: "/workforce/enquiries", destination: "/work/all", permanent: true },
      { source: "/workforce/enquiries/:invitationId", destination: "/work/enquiries/:invitationId", permanent: true },
      { source: "/projects/enquiries", destination: "/work/all", permanent: true },
      { source: "/projects/enquiries/:invitationId", destination: "/work/enquiries/:invitationId", permanent: true },
      { source: "/projects/enquiries/:invitationId/estimate", destination: "/work/enquiries/:invitationId/estimate", permanent: true },
      { source: "/workforce/shifts", destination: "/work/all", permanent: true },
      { source: "/workforce/shifts/:engagementId", destination: "/work/jobs/:engagementId", permanent: true },
      { source: "/workforce/shifts/:engagementId/days/:stageId", destination: "/work/jobs/:engagementId/days/:stageId", permanent: true },
      { source: "/projects/stages", destination: "/work/all", permanent: true },
      { source: "/projects/stages/:engagementId", destination: "/work/jobs/:engagementId", permanent: true },
      { source: "/workforce/crew", destination: "/me/crew", permanent: true },
      { source: "/earnings", destination: "/money", permanent: true },
      { source: "/profile", destination: "/me", permanent: true },
      { source: "/availability", destination: "/me", permanent: true },
    ];
  },
};

export default nextConfig;
