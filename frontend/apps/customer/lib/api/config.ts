/**
 * Where the Django API lives.
 *
 * Two variables, because the browser and the server can legitimately reach the
 * API by different routes: the browser must use a publicly resolvable origin,
 * while server rendering can use an internal address that skips the public load
 * balancer. In development both are usually the same.
 */

/** Origin the browser calls. Must be public and CORS-permitted. */
export const PUBLIC_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/**
 * Origin server rendering calls. Falls back to the public one so a single
 * variable is enough to run locally.
 */
export const SERVER_API_BASE_URL = process.env.API_BASE_URL ?? PUBLIC_API_BASE_URL;

/**
 * Cache lifetimes for public catalog reads, in seconds.
 *
 * Catalog changes only when Operations publishes an update, so serving it a few
 * minutes stale removes most of the latency from public navigation. Nothing
 * price-authoritative is cached longer than this, and anything tied to capacity,
 * a quote or a session is never cached at all — a cached availability answer is
 * a fabricated capacity claim.
 *
 * ## Zero in development, and it is not a micro-optimisation
 *
 * The catalogue is what the requirement flow renders its questions from. With a
 * five-minute cache, editing the catalogue — running the seed, deactivating a
 * question, renaming an option — changes nothing on screen for five minutes,
 * and a reload does not help because the reload is served from the same cache.
 *
 * That is indistinguishable from the change not working. It cost real time
 * chasing a question that had already been removed from the database and was
 * still being served from here.
 */
export const CATALOG_REVALIDATE_SECONDS =
  process.env.NODE_ENV === "production" ? 300 : 0;

/** Cache tags, so a catalog publish can invalidate precisely. */
export const CACHE_TAGS = {
  catalog: "catalog",
  category: (slug: string) => `catalog:category:${slug}`,
  service: (slug: string) => `catalog:service:${slug}`,
} as const;
