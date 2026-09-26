"use client";

import { getStableIdempotencyKey, request, type Schemas } from "@vsolve/api-client";
import { SESSION_STATE, VOLATILE_STATE, EXPIRING_STATE, queryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";
import type { OperationsCase } from "./model/cases";

/**
 * The Operations surface contract 1.32.0 added, and nothing it already had.
 *
 * ## This module does not re-implement the case console
 *
 * `features/cases/queries.ts` already owns the case list, the case detail, claim, escalate,
 * resolve and notes, against the same endpoints. Wave C6 widened the *vocabulary* those endpoints
 * speak — five more kinds, six more event kinds, two more subjects — and added three commands. It
 * did not fork the case system, and neither does this: the M2 workspace imports those hooks and
 * this file adds only what is new. Two query modules over one endpoint would be two caches of one
 * case, and the second one to be invalidated would be the one on screen.
 *
 * ## Keys live under `queryKeys.operations.all`
 *
 * `packages/query/src/m2-keys.ts` is frozen for this wave and publishes no Operations keys, and
 * `keys.ts` belongs to no session. Rooting these locally under the shared `operations` prefix
 * keeps a broad Operations invalidation working — a case command that changes a payout hold
 * should be able to reach the reconciliation summary, and it can.
 *
 * ## Every command carries the version it was decided against
 *
 * A case moves while somebody reads it. The idempotency key includes `expected_version`, so
 * re-pressing a button for the case you were looking at replays, while pressing it again after it
 * moved is a different command against a different world.
 */

export type CaseAppealOutcome = Schemas["CaseAppealDecisionRequestOutcomeEnum"];
export type PartyCase = Schemas["PartyCase"];
export type ReconciliationSummary = Schemas["ReconciliationSummary"];
export type RequestTimeline = Schemas["RequestTimeline"];
export type TouchMetric = Schemas["TouchMetric"];
export type TouchRollup = Schemas["TouchRollup"];

const OPS = queryKeys.operations.all;

export const m2CaseKeys = {
  reconciliation: () => [...OPS, "m2", "reconciliation"] as const,
  requestTimeline: (requirementId: string) =>
    [...OPS, "m2", "request-timeline", requirementId] as const,
  touchMetric: (requirementId: string) => [...OPS, "m2", "touch-metric", requirementId] as const,
  touchRollup: () => [...OPS, "m2", "touch-rollup"] as const,
};

/* ---------------------------------------------------------------------------
   Reads
   --------------------------------------------------------------------------- */

/**
 * What Finance is carrying right now.
 *
 * `VOLATILE_STATE`: this is read to decide whether a Customer has been paid back. A minute-old
 * "no failed refunds" is a claim about money made from a stale count.
 */
export function useReconciliationSummary() {
  return useQuery({
    queryKey: m2CaseKeys.reconciliation(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/operations/reconciliation/", {})),
    ...VOLATILE_STATE,
  });
}

/**
 * Everything that happened to one request, assembled from the aggregates.
 *
 * Read here for the **money** on a request — the booking fee, the unlock, the visit plan and its
 * shares — which is the only published Operations read of a booking-fee status, and therefore the
 * only place `WAIVED` can be told apart from a charge.
 */
export function useRequestTimeline(requirementId: string | null) {
  return useQuery({
    queryKey: m2CaseKeys.requestTimeline(requirementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/requests/{requirement_id}/timeline/", {
          params: { path: { requirement_id: requirementId! } },
        }),
      ),
    enabled: requirementId !== null && requirementId !== "",
    ...EXPIRING_STATE,
  });
}

/** One request's Operations touches, against the budget — or against the absence of one. */
export function useTouchMetric(requirementId: string | null) {
  return useQuery({
    queryKey: m2CaseKeys.touchMetric(requirementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/requests/{requirement_id}/touch-metric/", {
          params: { path: { requirement_id: requirementId! } },
        }),
      ),
    enabled: requirementId !== null && requirementId !== "",
    ...VOLATILE_STATE,
  });
}

/**
 * The platform-wide touch rollup.
 *
 * `SESSION_STATE` rather than `VOLATILE_STATE`: this is a trend measured over a window the server
 * chooses, read to check a design against unit economics. Nobody makes a per-request decision
 * from it, and refetching a rollup on every focus is load with no reader.
 */
export function useTouchRollup() {
  return useQuery({
    queryKey: m2CaseKeys.touchRollup(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/operations/metrics/touches/", {})),
    ...SESSION_STATE,
  });
}

/* ---------------------------------------------------------------------------
   Commands
   --------------------------------------------------------------------------- */

function caseCommandKey(action: string, caseId: string, version: number): string {
  return getStableIdempotencyKey(`case-${action}:${caseId}:${version}`);
}

/**
 * The case cache, written the same way `features/cases/queries.ts` writes it.
 *
 * Same keys deliberately: the detail response replaces the detail, and the queue row is
 * invalidated rather than patched because this response knows nothing about the rest of the
 * queue. The reconciliation summary is invalidated too — resolving a case releases a payout hold,
 * and a stale "held" count on the money screen is the number somebody escalates from.
 */
function useCaseCache() {
  const queryClient = useQueryClient();
  return {
    apply(updated: OperationsCase) {
      queryClient.setQueryData(queryKeys.operations.case(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: [...OPS, "cases"] });
      void queryClient.invalidateQueries({ queryKey: m2CaseKeys.reconciliation() });
    },
    refetch(caseId: string) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operations.case(caseId) });
    },
  };
}

interface VersionedCase {
  caseId: string;
  expectedVersion: number;
}

/**
 * Move the deadline **the parties** are measured on.
 *
 * Distinct from `due_at`, which is Operations' own SLA. Forward only: the server refuses a
 * backwards move rather than clamping it, because moving it back would retroactively time
 * somebody out of a window they were still inside.
 */
export function useSetCaseResponseDeadline() {
  const cache = useCaseCache();
  return useMutation({
    mutationFn: (input: VersionedCase & { responseDueAt: string; reason: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/cases/{case_id}/response-deadline/", {
          params: {
            path: { case_id: input.caseId },
            header: {
              "Idempotency-Key": caseCommandKey(
                `deadline:${input.responseDueAt}`,
                input.caseId,
                input.expectedVersion,
              ),
            },
          },
          body: {
            expected_version: input.expectedVersion,
            response_due_at: input.responseDueAt,
            reason: input.reason,
          },
        }),
      ),
    onSuccess: cache.apply,
    onError: (_error, input) => cache.refetch(input.caseId),
    retry: false,
  });
}

/**
 * Decide an appeal a party raised.
 *
 * `UPHELD` keeps the resolution. `OVERTURNED` **reopens** the case to `IN_PROGRESS`, clears the
 * resolution and puts the payout hold back — it does not re-decide it. The second decision is a
 * real decision taken by somebody looking at the case again, so the screen returns to the working
 * state rather than showing a new outcome.
 */
export function useDecideCaseAppeal() {
  const cache = useCaseCache();
  return useMutation({
    mutationFn: (input: VersionedCase & { outcome: CaseAppealOutcome; note: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/cases/{case_id}/appeal-decision/", {
          params: {
            path: { case_id: input.caseId },
            header: {
              "Idempotency-Key": caseCommandKey(
                `appeal:${input.outcome}`,
                input.caseId,
                input.expectedVersion,
              ),
            },
          },
          body: {
            expected_version: input.expectedVersion,
            outcome: input.outcome,
            note: input.note,
          },
        }),
      ),
    onSuccess: cache.apply,
    onError: (_error, input) => cache.refetch(input.caseId),
    retry: false,
  });
}

/**
 * Override a resolved case's terminal result, by hand, with the audit as the whole control.
 *
 * Still checked against `allowed_resolutions`: an override reaches a *different* documented
 * outcome, never an undocumented one. The previous result stays in the event context, so the
 * trail reads "we said X, then we said Y, and here is who and why".
 */
export function useOverrideCaseOutcome() {
  const cache = useCaseCache();
  return useMutation({
    mutationFn: (input: VersionedCase & { resolution: string; note: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/cases/{case_id}/override/", {
          params: {
            path: { case_id: input.caseId },
            header: {
              "Idempotency-Key": caseCommandKey(
                `override:${input.resolution}`,
                input.caseId,
                input.expectedVersion,
              ),
            },
          },
          body: {
            expected_version: input.expectedVersion,
            resolution: input.resolution,
            note: input.note,
          },
        }),
      ),
    onSuccess: cache.apply,
    onError: (_error, input) => cache.refetch(input.caseId),
    retry: false,
  });
}

/**
 * Record a chargeback against a payment attempt.
 *
 * Opens a `CHARGEBACK` case, which holds payout. **The fee row itself does not move**: a
 * chargeback is a claim in progress, and marking an earned fee refunded would tell both parties a
 * decision had been taken that has not. The response is the case that now owns it.
 */
export function useRecordChargeback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      paymentAttemptId: string;
      amountPaise: number;
      providerReference: string;
      reasonCode: string;
    }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/payments/{payment_attempt_id}/chargeback/", {
          params: {
            path: { payment_attempt_id: input.paymentAttemptId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `chargeback:${input.paymentAttemptId}:${input.providerReference}`,
              ),
            },
          },
          body: {
            amount_paise: input.amountPaise,
            provider_reference: input.providerReference,
            reason_code: input.reasonCode,
          },
        }),
      ),
    onSuccess: () => {
      // A new case, a new financial exception and a new payout hold, none of which this response
      // enumerates. Invalidate rather than patch.
      void queryClient.invalidateQueries({ queryKey: [...OPS, "cases"] });
      void queryClient.invalidateQueries({ queryKey: m2CaseKeys.reconciliation() });
    },
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   Refusals worth naming
   --------------------------------------------------------------------------- */

function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/**
 * The owner has not set the window this command measures against.
 *
 * Not a retry, and not a bug in the request: the appeal window or the free-cancel window T is
 * unset, so the command fails closed rather than guessing. The screen says so and stops.
 */
export function isPolicyUnavailable(error: unknown): boolean {
  return codeOf(error) === "m2_policy_unavailable";
}

/** The state does not allow it, or a required reason is missing. The message names which. */
export function isTransitionNotAllowed(error: unknown): boolean {
  return codeOf(error) === "m2_requirement_transition_not_allowed";
}

/** Somebody else moved this case while it was on screen. */
export function isVersionConflict(error: unknown): boolean {
  const code = codeOf(error);
  return code === "case_conflict" || code === "version_conflict";
}
