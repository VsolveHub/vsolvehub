import "server-only";

import { createApiClient, type ApiClient } from "@vsolve/api-client";

import { SERVER_API_BASE_URL } from "./config";

/**
 * API client for public, cacheable server-side reads.
 *
 * The Partner app needs the public catalog for one thing: the list of trades and
 * services an applicant can offer. That list is the same for every applicant, so
 * it is fetched here — free of `next/headers` — and the "never varies by user"
 * guarantee stays structural rather than a comment.
 *
 * Session-scoped Partner reads go through the browser client and TanStack Query.
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
        next:
          cache.revalidate === false
            ? { revalidate: 0 }
            : { revalidate: cache.revalidate, tags: cache.tags },
        // Belt and braces: a cacheable request must never carry credentials.
        credentials: "omit",
      }),
  });
}
