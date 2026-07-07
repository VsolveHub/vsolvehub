import { QueryClient, defaultShouldDehydrateQuery, isServer } from "@tanstack/react-query";

/**
 * One place that configures TanStack Query for every V Solve Hub app.
 *
 * Defaults are tuned for a mobile marketplace:
 *  - staleTime 60s   → revisiting a screen serves from cache instantly, then
 *                      background-revalidates; no spinner on navigation.
 *  - gcTime 5m       → cache survives short detours between screens.
 *  - refetchOnWindowFocus off → avoid surprise refetches on a mobile web app.
 *  - retry 1         → fail fast on a flaky network instead of hanging.
 *
 * Per-query needs (e.g. a tracker that polls every 4s) override these locally
 * with `staleTime`/`refetchInterval`.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
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
