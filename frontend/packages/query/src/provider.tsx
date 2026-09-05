"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { getQueryClient } from "./client";
import { shouldRenderQueryDevtools } from "./devtools";

/**
 * App-wide TanStack Query provider. Mount once in each app's root layout so the
 * whole tree shares one browser cache. Devtools render only in development (the
 * branch is dead-code-eliminated in production builds).
 */
export function QueryProvider({
  children,
  showDevtools = true,
}: {
  children: React.ReactNode;
  /** Keeps the floating development launcher off presentation-critical apps. */
  showDevtools?: boolean;
}) {
  // getQueryClient() returns the browser singleton on the client, so this does
  // not create a new client on every render.
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {shouldRenderQueryDevtools(process.env.NODE_ENV, showDevtools) &&
      process.env.NEXT_PUBLIC_QUERY_DEVTOOLS === "true" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  );
}
