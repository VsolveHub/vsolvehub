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
