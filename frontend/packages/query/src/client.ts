import { QueryClient, defaultShouldDehydrateQuery, isServer } from "@tanstack/react-query";

import { SESSION_STATE } from "./freshness";
import { queryRetryDelay, shouldRetryMutation, shouldRetryQuery } from "./retry";

/**
 * One place that configures TanStack Query for every V Solve Hub app.
 *
 * These defaults suit session-scoped reads. Any query touching catalog,
 * availability, quotes, capacity holds or live offers must pick a tier from
 * `freshness.ts` explicitly — the correct staleness for expiry-bearing state is
 * a correctness decision, not a default. A cached availability result is a
 * fabricated capacity claim.
 *
 * Retry behaviour lives in `retry.ts`: only transport failures are retried, and
 * mutations are never retried unless the caller opts in with a stable
 * idempotency key.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: SESSION_STATE.staleTime,
        gcTime: SESSION_STATE.gcTime,
        refetchOnWindowFocus: SESSION_STATE.refetchOnWindowFocus,
        refetchOnReconnect: SESSION_STATE.refetchOnReconnect,
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelay,
      },
      mutations: {
        // Default no-retry. A mutation that is provably safe to retry opts in
        // per call with `shouldRetryMutation(count, error, { idempotent: true })`
        // and a stable idempotency key.
        retry: (failureCount, error) => shouldRetryMutation(failureCount, error),
      },
      dehydrate: {
        // Also ship still-pending queries so server-started fetches continue
        // seamlessly on the client (streaming-friendly).
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Returns the request-scoped client on the server (a fresh one each render, so
 * user data never leaks between requests) and a stable singleton in the browser
 * (so the cache persists across client navigations). This is the official
 * App-Router pattern.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
