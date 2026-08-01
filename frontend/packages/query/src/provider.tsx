"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { getQueryClient } from "./client";

/**
 * App-wide TanStack Query provider. Mount once in each app's root layout so the
 * whole tree shares one browser cache. Devtools render only in development (the
 * branch is dead-code-eliminated in production builds).
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  // getQueryClient() returns the browser singleton on the client, so this does
  // not create a new client on every render.
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  );
}
