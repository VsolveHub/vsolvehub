import type { QueryClient, QueryKey } from "@tanstack/react-query";

import type { FreshnessTier } from "./freshness";

/**
 * Options for an imperative read that must share TanStack Query's cache.
 *
 * Declarative screens use `useQuery`. Event handlers, quick-add flows and other
 * one-off reads use `fetchCachedQuery` so the same key, freshness tier and
 * deduplication rules apply — a direct `request()` bypasses all three and
 * repeats network work the cache already paid for.
 */
export interface CachedQueryDefinition<TData> extends FreshnessTier {
  queryKey: QueryKey;
  queryFn: () => Promise<TData>;
}

/**
 * Reads through the shared QueryClient cache, fetching only when stale.
 *
 * Spreads the caller's freshness tier explicitly because imperative fetches do
 * not inherit hook-level overrides and a missing tier would fall back to
 * defaults that may be wrong for the resource (catalog vs cart vs quotes).
 */
export function fetchCachedQuery<TData>(
  queryClient: QueryClient,
  definition: CachedQueryDefinition<TData>,
): Promise<TData> {
  const { queryKey, queryFn, ...freshness } = definition;
  return queryClient.fetchQuery({ queryKey, queryFn, ...freshness });
}

/**
 * Returns cached data when fresh, otherwise fetches once and stores the result.
 *
 * Same cache contract as {@link fetchCachedQuery}, but skips the network when
 * the entry is still within its stale window — useful when a screen already
 * mounted the hook and an handler only needs the latest in-memory value.
 */
export function ensureCachedQuery<TData>(
  queryClient: QueryClient,
  definition: CachedQueryDefinition<TData>,
): Promise<TData> {
  const { queryKey, queryFn, ...freshness } = definition;
  return queryClient.ensureQueryData({ queryKey, queryFn, ...freshness });
}
