import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { SESSION_STATE, queryRetryDelay, shouldRetryMutation, shouldRetryQuery } from "@vsolve/query/native";

let client: QueryClient | undefined;

/** Same defaults as the web query client. One instance for the whole app. */
export function getMobileQueryClient(): QueryClient {
  if (!client) {
    client = new QueryClient({
      defaultOptions: {
        queries: {
          networkMode: "always",
          staleTime: SESSION_STATE.staleTime,
          gcTime: SESSION_STATE.gcTime,
          refetchOnWindowFocus: SESSION_STATE.refetchOnWindowFocus,
          refetchOnReconnect: SESSION_STATE.refetchOnReconnect,
          retry: shouldRetryQuery,
          retryDelay: queryRetryDelay,
        },
        mutations: {
          networkMode: "always",
          retry: (failureCount, error) => shouldRetryMutation(failureCount, error),
        },
      },
    });
  }
  return client;
}

export function bindAppStateFocus(state: string): void {
  focusManager.setFocused(state === "active");
}

export function bindNetworkOnline(isConnected: boolean | null): void {
  onlineManager.setOnline(isConnected !== false);
}
