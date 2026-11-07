// Ported from frontend/apps/customer/features/project/queries.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getStableIdempotencyKey, request } from "@vsolve/api-client";
import {
  EXPIRING_STATE,
  m2QueryKeys,
  shouldRetryM2Read,
  type ProjectPlan,
  type ProjectTransfer,
} from "@vsolve/query/native";
import { getApiClient } from "@vsolve/mobile-core";

export type { ProjectPlan, ProjectTransfer };

export function useProject(engagementId: string, enabled = true) {
  return useQuery({
    queryKey: [...m2QueryKeys.engagements.detail(engagementId), "project"] as const,
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagements/{engagement_id}/project/", {
          params: { path: { engagement_id: engagementId } },
        }),
      ),
    enabled,
    ...EXPIRING_STATE,
    retry: shouldRetryM2Read,
  });
}

function invalidateProject(
  queryClient: ReturnType<typeof useQueryClient>,
  engagementId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: m2QueryKeys.engagements.detail(engagementId),
  });
  void queryClient.invalidateQueries({ queryKey: m2QueryKeys.engagements.all });
}

export function useAcceptHandover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (engagementId: string) =>
      request(() =>
        getApiClient().POST("/api/v1/engagements/{engagement_id}/handover/acceptance/", {
          params: {
            path: { engagement_id: engagementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(`m2-handover-accept:${engagementId}`),
            },
          },
        }),
      ),
    onSettled: (_data, _error, engagementId) => {
      invalidateProject(queryClient, engagementId);
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.requirements.all });
    },
    retry: false,
  });
}

export interface TransferDecisionInput {
  engagementId: string;
  transferId: string;
  accept: boolean;
}

export function useDecideTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: TransferDecisionInput) =>
      request(() =>
        getApiClient().POST("/api/v1/project-transfers/{project_transfer_id}/decision/", {
          params: {
            path: { project_transfer_id: input.transferId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-project-transfer:${input.transferId}:${input.accept ? "accept" : "decline"}`,
              ),
            },
          },
          body: { accept: input.accept },
        }),
      ),
    onSettled: (_data, _error, input) => invalidateProject(queryClient, input.engagementId),
    retry: false,
  });
}

export interface DelayClaimDecisionInput {
  engagementId: string;
  delayClaimId: string;
  accept: boolean;
  note: string;
}

export function useDecideDelayClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DelayClaimDecisionInput) =>
      request(() =>
        getApiClient().POST("/api/v1/project-delay-claims/{delay_claim_id}/decision/", {
          params: {
            path: { delay_claim_id: input.delayClaimId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-delay-claim:${input.delayClaimId}:${input.accept ? "accept" : "reject"}`,
              ),
            },
          },
          body: { accept: input.accept, note: input.note },
        }),
      ),
    onSettled: (_data, _error, input) => invalidateProject(queryClient, input.engagementId),
    retry: false,
  });
}

