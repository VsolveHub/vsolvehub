// Ported from frontend/apps/customer/features/account/queries.ts (privacy requests only)
import { request, type Schemas } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { SESSION_STATE, queryKeys } from "@vsolve/query/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PrivacyRequest = Schemas["PrivacyRequest"];
export type PrivacyRequestKind = Schemas["PrivacyRequestKindEnum"];
export type PrivacyStatus = Schemas["PrivacyStatusEnum"];

export function usePrivacyRequests(enabled = true) {
  return useQuery({
    queryKey: queryKeys.privacy.requests(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/auth/privacy/requests/")),
    enabled,
    ...SESSION_STATE,
  });
}

export function useCreatePrivacyRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kind: PrivacyRequestKind) =>
      request(() => getApiClient().POST("/api/v1/auth/privacy/requests/", { body: { kind } })),
    onSuccess: (created) => {
      queryClient.setQueryData<PrivacyRequest[]>(queryKeys.privacy.requests(), (current = []) => [
        created,
        ...current.filter((item) => item.id !== created.id),
      ]);
    },
    retry: false,
  });
}

export function isRequestOpen(privacyRequest: PrivacyRequest): boolean {
  return privacyRequest.status === "RECEIVED" || privacyRequest.status === "IN_REVIEW";
}
