"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Phase A: the vendor price book — Operations' side (contract 1.46.0).
 *
 * Three surfaces, one module: the work-item catalog and its per-city reference
 * rates, the guardrail policy every Partner's rate is checked against, and the
 * custom-item review queue that lets the catalog learn from what Partners
 * actually price. See `docs/prompts/vendor-price-book-build-prompt.md`.
 *
 * Cache keys are local to this feature rather than in the shared `m2OpsKeys`
 * factory `m2-ops.ts` documents as frozen for its wave — the same reasoning
 * that file gives for its own keys living outside `keys.ts`.
 */

export type WorkItem = Schemas["WorkItem"];
export type WorkItemRate = Schemas["WorkItemRate"];
export type WorkItemCreate = Schemas["WorkItemCreateRequest"];
export type WorkItemUpdate = Schemas["PatchedWorkItemUpdateRequest"];
export type QuoteGuardrailPolicy = Schemas["QuoteGuardrailPolicy"];
export type QuoteGuardrailPolicyActivate = Schemas["QuoteGuardrailPolicyActivateRequest"];
export type CustomWorkItemReview = Schemas["CustomWorkItemReview"];
export type SkillOption = Schemas["PartnerSkillOption"];
export type ServiceAreaOption = Schemas["PartnerServiceAreaOption"];

const KEYS = {
  workItems: (skillId: string | null) => ["m2", "work-items", skillId] as const,
  workItemRates: (workItemId: string) => ["m2", "work-items", workItemId, "rates"] as const,
  guardrailPolicies: () => ["m2", "guardrail-policies"] as const,
  customItemReviews: () => ["m2", "custom-item-reviews"] as const,
};

/* ---------------------------------------------------------------------------
   The catalog
   --------------------------------------------------------------------------- */

export function useWorkItems(skillId: string | null) {
  return useQuery({
    queryKey: KEYS.workItems(skillId),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/work-items/", {
          params: { query: skillId ? { skill_id: skillId } : {} },
        }),
      ),
  });
}

export function useCreateWorkItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: WorkItemCreate) =>
      request(() => getApiClient().POST("/api/v1/operations/work-items/", { body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["m2", "work-items"] });
    },
    retry: false,
  });
}

export function useUpdateWorkItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, body }: { workItemId: string; body: WorkItemUpdate }) =>
      request(() =>
        getApiClient().PATCH("/api/v1/operations/work-items/{work_item_id}/", {
          params: { path: { work_item_id: workItemId } },
          body,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["m2", "work-items"] });
    },
    retry: false,
  });
}

export function useWorkItemRates(workItemId: string | null) {
  return useQuery({
    queryKey: KEYS.workItemRates(workItemId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/work-items/{work_item_id}/rates/", {
          params: { path: { work_item_id: workItemId as string } },
        }),
      ),
    enabled: workItemId !== null,
  });
}

export function usePublishWorkItemRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workItemId,
      serviceAreaId,
      referenceRatePaise,
    }: {
      workItemId: string;
      serviceAreaId: string;
      referenceRatePaise: number;
    }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/work-items/{work_item_id}/rates/", {
          params: {
            path: { work_item_id: workItemId },
          },
          body: { service_area_id: serviceAreaId, reference_rate_paise: referenceRatePaise },
        }),
      ),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: KEYS.workItemRates(variables.workItemId) });
    },
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   The guardrail policy
   --------------------------------------------------------------------------- */

export function useGuardrailPolicies() {
  return useQuery({
    queryKey: KEYS.guardrailPolicies(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/operations/quote-guardrails/", {})),
  });
}

export function useActivateGuardrailPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: QuoteGuardrailPolicyActivate) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/quote-guardrails/activate/", { body }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.guardrailPolicies() });
    },
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   The custom-item review queue
   --------------------------------------------------------------------------- */

export function useCustomItemReviews() {
  return useQuery({
    queryKey: KEYS.customItemReviews(),
    queryFn: () =>
      request(() => getApiClient().GET("/api/v1/operations/custom-item-reviews/", {})),
  });
}

export function useResolveCustomItemReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      reviewId,
      approve,
      skillId,
    }: {
      reviewId: string;
      approve: boolean;
      skillId?: string | null;
    }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/custom-item-reviews/{review_id}/resolve/", {
          params: { path: { review_id: reviewId } },
          body: { approve, skill_id: skillId ?? null },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.customItemReviews() });
      void queryClient.invalidateQueries({ queryKey: ["m2", "work-items"] });
    },
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   Shared option lists — the same endpoints the rate-card board reads.
   --------------------------------------------------------------------------- */

export function useSkillOptions() {
  return useQuery({
    queryKey: ["partner-skill-options"] as const,
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/skills/", {})),
  });
}

export function useServiceAreas() {
  return useQuery({
    queryKey: ["service-areas"] as const,
    queryFn: () => request(() => getApiClient().GET("/api/v1/service-areas/", {})),
  });
}
