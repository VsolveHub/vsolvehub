"use client";

import { request, type Schemas } from "@vsolve/api-client";
import {
  VOLATILE_STATE,
  cursorFromNextUrl,
  queryKeys,
  useCurrentSession,
} from "@vsolve/query";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";
import { isStaleRule } from "./model/failures";

/**
 * Operations' compatibility-rule commands.
 *
 * Every write here is a domain command carrying the version the operator was
 * looking at. There is no endpoint that edits a rule in place, and there should
 * not be: a rule's history is the evidence that two different people agreed to
 * it, and an in-place edit would erase the second signature.
 *
 * ## Rules are read volatile, not session-fresh
 *
 * The Partner-application detail uses `SESSION_STATE`, because a reviewer holds
 * an application for minutes at a time and nobody else is competing for it.
 * A draft rule is the opposite: it exists specifically so a *second* person can
 * act on it, so the console must assume someone is about to. Serving a minute-old
 * lifecycle status would render Activate on a rule that has already been
 * rejected — and the operator would only find out by pressing it.
 */

type Rule = Schemas["CompatibilityRule"];

export interface RuleFilters {
  lifecycleStatus?: Schemas["LifecycleStatusEnum"];
  /** Narrows to rules touching one service variant, on either side. */
  variantId?: string;
}

/**
 * The signed-in Operations user's id.
 *
 * Read from the same session query the shell already guards on, so it is a cache
 * hit rather than a second request. `null` while it is loading, and the
 * maker-checker helpers treat `null` as "cannot prove this is a different
 * person" — which is the safe reading.
 */
export function useActorId(): string | null {
  const session = useCurrentSession(getApiClient());
  return session.data?.user?.id ?? null;
}

export function useCompatibilityRules(filters: RuleFilters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.operations.compatibilityRules(filters),
    queryFn: ({ pageParam }) =>
      request(() =>
        getApiClient().GET("/api/v1/operations/compatibility-rules/", {
          params: {
            query: {
              ...(filters.lifecycleStatus ? { lifecycle_status: filters.lifecycleStatus } : {}),
              ...(filters.variantId ? { variant_id: filters.variantId } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      ),
    initialPageParam: "",
    getNextPageParam: (lastPage) => cursorFromNextUrl(lastPage.next),
    ...VOLATILE_STATE,
  });
}

export function useCompatibilityRule(ruleId: string | null) {
  return useQuery({
    queryKey: queryKeys.operations.compatibilityRule(ruleId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/compatibility-rules/{rule_id}/", {
          params: { path: { rule_id: ruleId as string } },
        }),
      ),
    enabled: ruleId !== null,
    ...VOLATILE_STATE,
  });
}

/** Every filtered view of the list, for when a command changed what they show. */
function invalidateRuleList(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({
    queryKey: [...queryKeys.operations.all, "compatibility-rules"],
  });
}

export interface DraftRuleInput {
  leftVariantId: string;
  rightVariantId: string;
  mode: Schemas["ModeEnum"];
  dependency: Schemas["DependencyEnum"];
  effectiveFrom: string;
  effectiveTo: string | null;
  changeReason: string;
}

/**
 * Proposes a rule.
 *
 * Creating a draft is not approving one — it takes effect only when a second
 * person activates it — so this is the one write on the surface that its author
 * may take alone.
 *
 * `conditions` is never sent. Django refuses to activate any rule that carries
 * them (`conditions_not_supported`), so a console that let an operator attach
 * conditions would be manufacturing drafts that can only ever be rejected.
 */
export function useProposeRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DraftRuleInput) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/compatibility-rules/", {
          body: {
            left_variant_id: input.leftVariantId.trim(),
            right_variant_id: input.rightVariantId.trim(),
            mode: input.mode,
            dependency: input.dependency,
            effective_from: input.effectiveFrom,
            ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}),
            change_reason: input.changeReason.trim(),
          },
        }),
      ),
    onSuccess: (rule: Rule) => {
      queryClient.setQueryData(queryKeys.operations.compatibilityRule(rule.id), rule);
      invalidateRuleList(queryClient);
    },
    onError: (error) => {
      // A concurrent draft for the same pair means the list the operator was
      // working from is already wrong. Go and look rather than leave them
      // proposing against a version that no longer exists.
      if (isStaleRule(error)) invalidateRuleList(queryClient);
    },
    // Never retried. A retried proposal is a second draft nobody chose to write.
    retry: false,
  });
}

export interface RuleCommandInput {
  ruleId: string;
  /** The version shown to the operator when they decided. */
  expectedVersion: number;
  /** Why. Reaches the audit record verbatim, and Django requires 10 characters. */
  reason: string;
}

function reviewRequest(path: "activate" | "reject", input: RuleCommandInput) {
  const client = getApiClient();
  const params = { path: { rule_id: input.ruleId } };
  const body = { expected_version: input.expectedVersion, review_reason: input.reason.trim() };

  return path === "activate"
    ? client.POST("/api/v1/operations/compatibility-rules/{rule_id}/activate/", { params, body })
    : client.POST("/api/v1/operations/compatibility-rules/{rule_id}/reject/", { params, body });
}

/**
 * Activates or rejects a draft — the checker half of maker-checker.
 *
 * The console does not offer either command to the rule's proposer, so a
 * `maker_checker_required` refusal here means the client acted on a rule whose
 * proposer it had not yet loaded. It is surfaced as its own message rather than
 * a generic conflict, because no amount of retrying or asking for access
 * changes it.
 */
export function useReviewRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RuleCommandInput & { command: "activate" | "reject" }) =>
      request(() => reviewRequest(input.command, input)),
    onSuccess: (rule: Rule) => {
      queryClient.setQueryData(queryKeys.operations.compatibilityRule(rule.id), rule);
      // Activation closes the previous active rule for the pair, so rows other
      // than this one changed and the list cannot be patched in place.
      invalidateRuleList(queryClient);
    },
    onError: (_error, input) => {
      // Whatever the refusal was, the operator now has to see the rule as it
      // actually stands before deciding a second time.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.operations.compatibilityRule(input.ruleId),
      });
      invalidateRuleList(queryClient);
    },
    // Never retried. A retried decision is a second decision, taken by nobody.
    retry: false,
  });
}

/**
 * Withdraws an active rule.
 *
 * Not gated on the proposer, and deliberately so: a rule can only be active
 * because a second person activated it, so the separation of duties has already
 * happened. Gating it here would leave a bad rule in force with nobody able to
 * pull it.
 */
export function useRetireRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RuleCommandInput) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/compatibility-rules/{rule_id}/retire/", {
          params: { path: { rule_id: input.ruleId } },
          body: { expected_version: input.expectedVersion, reason: input.reason.trim() },
        }),
      ),
    onSuccess: (rule: Rule) => {
      queryClient.setQueryData(queryKeys.operations.compatibilityRule(rule.id), rule);
      invalidateRuleList(queryClient);
    },
    onError: (_error, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.operations.compatibilityRule(input.ruleId),
      });
      invalidateRuleList(queryClient);
    },
    retry: false,
  });
}
