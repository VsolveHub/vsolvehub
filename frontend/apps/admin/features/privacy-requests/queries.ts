import { request, type Schemas } from "@vsolve/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

export type PrivacyRequestRow = Schemas["OperationsPrivacyRequest"];
export type PrivacyRequestHold = Schemas["PrivacyRequestHold"];
export type QueueState = "open" | "closed";

export const privacyRequestKeys = {
  all: ["ops-privacy-requests"] as const,
  list: (state: QueueState) => ["ops-privacy-requests", state] as const,
};

/**
 * The deletion and data-copy queue. `open` is the working list: held ones first, then by the
 * date deletion is due. Holds are worked out by Django on each read, so a refetch after paying
 * a partner out or cancelling a booking shows whether the account can go now.
 */
export function usePrivacyRequestQueue(state: QueueState) {
  return useQuery({
    queryKey: privacyRequestKeys.list(state),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/privacy-requests/", {
          params: { query: { state } },
        }),
      ),
  });
}

type Command = "hold" | "release" | "cancel" | "reject" | "complete" | "erase";

/** One decision on one request. The server answers with the refreshed row. */
export function usePrivacyRequestCommand(command: Command) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text?: string }): Promise<PrivacyRequestRow> => {
      const client = getApiClient();
      const path = { params: { path: { privacy_request_id: id } } };
      switch (command) {
        case "hold":
          return request(() =>
            client.POST("/api/v1/operations/privacy-requests/{privacy_request_id}/hold/", {
              ...path,
              body: { reason: text ?? "" },
            }),
          );
        case "release":
          return request(() =>
            client.POST("/api/v1/operations/privacy-requests/{privacy_request_id}/release/", path),
          );
        case "cancel":
          return request(() =>
            client.POST("/api/v1/operations/privacy-requests/{privacy_request_id}/cancel/", {
              ...path,
              body: { reason: text ?? "" },
            }),
          );
        case "reject":
          return request(() =>
            client.POST("/api/v1/operations/privacy-requests/{privacy_request_id}/reject/", {
              ...path,
              body: { reason: text ?? "" },
            }),
          );
        case "complete":
          return request(() =>
            client.POST("/api/v1/operations/privacy-requests/{privacy_request_id}/complete/", {
              ...path,
              body: { note: text ?? "" },
            }),
          );
        case "erase":
          return request(() =>
            client.POST("/api/v1/operations/privacy-requests/{privacy_request_id}/erase/", path),
          );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: privacyRequestKeys.all });
    },
    retry: false,
  });
}

/** File a deletion for somebody who reached support instead of the app. */
export function useFileDeletionForUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/users/{user_id}/deletion-request/", {
          params: { path: { user_id: userId } },
          body: { reason },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: privacyRequestKeys.all });
    },
    retry: false,
  });
}
