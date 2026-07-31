import "server-only";

import { createApiClient, type ApiClient } from "@vsolve/api-client";

import { SERVER_API_BASE_URL } from "./config";

/**
 * API client for public, cacheable server-side reads.
 *
 * Kept in its own module, deliberately free of `next/headers`, so a public
 * catalog read cannot pull in cookie machinery even by accident. The guarantee
 * that a cacheable response never varies by user is then structural rather than
 * a comment someone has to remember.
 *
 * Session-scoped reads live in `./private`.
 */

export interface CachePolicy {
  /** Seconds before a cached response is refetched. `false` disables caching. */
  revalidate: number | false;
  /** Tags for targeted invalidation when Operations publishes a change. */
  tags?: string[];
}

export function createPublicApi(cache: CachePolicy): ApiClient {
  return createApiClient({
    baseUrl: SERVER_API_BASE_URL,
    fetch: (request) =>
      fetch(request, {
        // Next reads caching options from the init argument, which is why the
        // policy is applied here rather than on the Request.
        next:
          cache.revalidate === false
            ? { revalidate: 0 }
            : { revalidate: cache.revalidate, tags: cache.tags },
        // Belt and braces: a cacheable request must never carry credentials.
        credentials: "omit",
      }),
  });
}
