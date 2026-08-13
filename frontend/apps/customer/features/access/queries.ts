"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearIdempotencyKey, getStableIdempotencyKey, request } from "@vsolve/api-client";
import {
  M2_FRESHNESS,
  boundedPoll,
  isUnlockSettled,
  isVisitPlanSettled,
  m2AccessKeys,
  m2QueryKeys,
  shouldRetryM2Read,
  type QuoteTeaserList,
  type SiteVisit,
  type UnlockState,
  type VisitPlan,
  type VisitPlanState,
} from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The money doors — contract 1.24.0.
 *
 * `GET`/`POST /requirements/{id}/unlock/` (A3) and `GET`/`POST
 * /requirements/{id}/visit-plan/` + `.../checkout/` (A5), plus the two visit-day
 * commands. Nothing in this file decides whether a Customer has bought
 * something: `unlockPhase` and `visitPlanPhase` in `@vsolve/query` read that off
 * the server's own record, and every screen renders from those.
 *
 * ## Why both reads poll, and only while a charge is in flight
 *
 * `m2-requirement.ts` records that nothing on the tracking screens polls,
 * because a wave going out and a quote arriving move in hours. A payment does
 * not. `PENDING → ACTIVE` happens when a **verified provider callback** reaches
 * Django, which can land seconds after the Customer returns from the provider —
 * or minutes later on a UPI collect, or after the browser has been closed and
 * reopened. The one thing a screen must never do is decide from the redirect, so
 * the screen re-reads until the server has an answer, and `boundedPoll` stops
 * the moment it does.
 *
 * ## Why there is no payment-attempt read anywhere in this wave
 *
 * There cannot be one. `GET /api/v1/payment-attempts/{id}/` resolves ownership
 * through `checkout__customer`, and an M2 access attempt is created with
 * `checkout=None` — so the endpoint answers `404` for every unlock, plan and
 * stage charge this app creates, and `POST .../simulate-capture/` refuses them
 * with a `PermissionError` for the same reason. The `AccessCheckout` response is
 * therefore used for exactly what it is: proof that an attempt exists, and the
 * provider handoff values. Logged in `frontend-execution-plan.md` §7.
 */

export type { UnlockState, VisitPlanState, VisitPlan, SiteVisit, QuoteTeaserList };

/* --------------------------------------------------------------------------
   A3 — teasers and the unlock
   -------------------------------------------------------------------------- */

/**
 * Quote teasers — `M2-FE-401`.
 *
 * Sent to a Customer who has paid nothing. Vendor name, contact, scope, line
 * items and the exact total are **absent from the response**, not merely
 * unrendered; a client cannot un-receive a payload and cached identity survives
 * a refund. What arrives is a verification flag, a vendor type, a price band and
 * whether the quote sits outside the declared budget.
 */
export function useQuoteTeasers(requirementId: string | null, enabled = true) {
  return useQuery({
    queryKey: m2AccessKeys.teasers(requirementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/requirements/{requirement_id}/quotes/teasers/", {
          params: { path: { requirement_id: requirementId! } },
        }),
      ),
    enabled: requirementId !== null && enabled,
    ...M2_FRESHNESS.proposals,
    retry: shouldRetryM2Read,
  });
}

/**
 * The unlock state — `M2-FE-402`, `M2-FE-403`, `M2-FE-404`.
 *
 * **This read is the truth about whether the Customer has an unlock**, and the
 * only one. It is also the browser-close recovery path: a Customer who comes
 * back on a different device holds a requirement id and nothing else, and this
 * answers from that alone.
 */
export function useUnlockState(requirementId: string | null, enabled = true) {
  return useQuery({
    queryKey: m2AccessKeys.unlock(requirementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/requirements/{requirement_id}/unlock/", {
          params: { path: { requirement_id: requirementId! } },
        }),
      ),
    enabled: requirementId !== null && enabled,
    ...M2_FRESHNESS.unlock,
    ...boundedPoll<UnlockState>({ isSettled: isUnlockSettled }),
    retry: shouldRetryM2Read,
  });
}

const UNLOCK_CHECKOUT_SCOPE = "m2-unlock-checkout";

/**
 * The stable key for buying one requirement's unlock.
 *
 * Keyed on the requirement alone. There is at most one unlock per requirement,
 * and `access.create_unlock_checkout` already resumes a `PENDING` attempt rather
 * than starting a second charge — so a double press, a dropped connection and a
 * reopened tab all land on the same attempt by two independent mechanisms.
 *
 * Persisted through `getStableIdempotencyKey`, which is what makes a lost
 * provider redirect resume the original attempt rather than open a second one.
 */
export function unlockCheckoutKey(requirementId: string): string {
  return getStableIdempotencyKey(`${UNLOCK_CHECKOUT_SCOPE}:${requirementId}`);
}

export interface StartUnlockInput {
  requirementId: string;
  /**
   * True only when the server's own record says the last attempt `FAILED`.
   *
   * A failed charge is the one case where pressing the button again is a
   * genuinely *new* command: replaying the stored key would hand back the
   * persisted `201` describing the attempt that already failed, and the screen
   * would sit waiting on a payment nobody restarted. Clearing the key is the
   * same move the attachment uploader makes on a spent upload intent.
   *
   * It is passed in rather than read here, so nothing in this file can decide
   * on its own that a charge failed.
   */
  isRetryAfterFailure: boolean;
}

/**
 * Starts the unlock charge — `M2-FE-403`.
 *
 * `201` with an `AccessCheckout`, which says an attempt exists and **nothing
 * more**. The screen must not read it as a purchase; `useUnlockState` is what
 * says whether anything was bought.
 *
 * No auto-retry. Every refusal here is a state the Customer has to read —
 * `m2_unlock_not_available` (the quote went away), `m2_access_price_unavailable`
 * (we cannot sell this at all) — and none of them changes on a resend.
 */
export function useStartUnlockCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartUnlockInput) => {
      if (input.isRetryAfterFailure) {
        clearIdempotencyKey(`${UNLOCK_CHECKOUT_SCOPE}:${input.requirementId}`);
      }
      return request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/unlock/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: { "Idempotency-Key": unlockCheckoutKey(input.requirementId) },
          },
        }),
      );
    },
    // Success and failure alike. A `201` means an attempt now exists and the
    // unlock has moved to `PENDING`; a refusal often means the world moved
    // (the quote expired, the request closed), and the screen has to be
    // re-rendered from what is actually there either way.
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2AccessKeys.unlock(input.requirementId),
      });
    },
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   A5 — the visit plan
   -------------------------------------------------------------------------- */

/**
 * The visit plan — `M2-FE-216`, `M2-FE-420`, `M2-FE-421`, `M2-FE-424`.
 *
 * One read for both halves of the A5 flow: `available_tiers` for the review
 * screen's chooser before a plan exists, and the plan, its per-slot shares and
 * the confirmed visits after. Two endpoints would have let the chooser and the
 * tracker disagree about which plan the Customer has.
 */
export function useVisitPlan(requirementId: string | null, enabled = true) {
  return useQuery({
    queryKey: m2AccessKeys.visitPlan(requirementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/requirements/{requirement_id}/visit-plan/", {
          params: { path: { requirement_id: requirementId! } },
        }),
      ),
    enabled: requirementId !== null && enabled,
    // The access tier: money in flight, then a grant that can be refunded out
    // from under it. `M2_FRESHNESS` has no visit-plan entry — `m2-keys.ts`
    // predates revision 3 and is frozen — and this is the tier it argues for.
    ...M2_FRESHNESS.unlock,
    ...boundedPoll<VisitPlanState>({ isSettled: isVisitPlanSettled }),
    retry: shouldRetryM2Read,
  });
}

export interface ChooseVisitPlanInput {
  requirementId: string;
  planSize: number;
}

/**
 * Chooses how many professionals will visit — `M2-FE-216`.
 *
 * **This charges nothing.** It bounds the invitation wave and snapshots the
 * price the Customer was shown, so a price loaded between choosing and the first
 * vendor confirming cannot silently become what they pay.
 *
 * The size is in the idempotency key, deliberately and unlike
 * `submitIntentKey`'s `allow_duplicate`. Re-choosing is a real, permitted action
 * until a vendor commits; sharing one key across sizes would make Django answer
 * `idempotency_key_reused` to a Customer changing their mind, and replaying it
 * would silently keep the first size.
 */
export function useChooseVisitPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ChooseVisitPlanInput) =>
      request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/visit-plan/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-visit-plan-choose:${input.requirementId}:${input.planSize}`,
              ),
            },
          },
          body: { plan_size: input.planSize },
        }),
      ),
    onSuccess: (_plan: VisitPlan, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2AccessKeys.visitPlan(input.requirementId),
      });
    },
    retry: false,
  });
}

const PLAN_CHECKOUT_SCOPE = "m2-visit-plan-checkout";

/**
 * The stable key for paying for one plan.
 *
 * Keyed on the **plan**, not the requirement. A reclassification can void a plan
 * and a later one can replace it, and a key that outlived the plan it was minted
 * for would replay the old plan's checkout against the new one.
 */
export function visitPlanCheckoutKey(planId: string): string {
  return getStableIdempotencyKey(`${PLAN_CHECKOUT_SCOPE}:${planId}`);
}

export interface StartVisitPlanCheckoutInput {
  requirementId: string;
  planId: string;
  /** As on the unlock: only when the server's record says the charge failed. */
  isRetryAfterFailure: boolean;
}

/**
 * Pays for the whole visit plan, once — `M2-FE-420`.
 *
 * One payment for every visit in the plan, taken against a slot a vendor has
 * actually committed to. The held slot hardens to `SCHEDULED` only on the
 * verified callback; if the Customer never pays, the hold lapses and **nothing
 * was charged**. Later vendors book without any further payment.
 */
export function useStartVisitPlanCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartVisitPlanCheckoutInput) => {
      if (input.isRetryAfterFailure) {
        clearIdempotencyKey(`${PLAN_CHECKOUT_SCOPE}:${input.planId}`);
      }
      return request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/visit-plan/checkout/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: { "Idempotency-Key": visitPlanCheckoutKey(input.planId) },
          },
        }),
      );
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2AccessKeys.visitPlan(input.requirementId),
      });
    },
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   Visit day — `M2-FE-422`
   -------------------------------------------------------------------------- */

export interface SiteVisitCommandInput {
  siteVisitId: string;
  /** Only so the plan read can be invalidated. This app owns no visit-level cache. */
  requirementId: string;
}

/**
 * Confirms the professional arrived — the non-OTP fallback.
 *
 * **The default path in M2, not a degraded one.** The start OTP is M3
 * activation, and `arrival_method` is stored so every historical arrival still
 * says truthfully how it was proved once OTP is switched on. Either party may
 * confirm; this is the Customer's side of it.
 */
export function useConfirmVisitArrival() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SiteVisitCommandInput) =>
      request(() =>
        getApiClient().POST("/api/v1/site-visits/{site_visit_id}/arrival/", {
          params: {
            path: { site_visit_id: input.siteVisitId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-visit-arrival:${input.siteVisitId}`,
              ),
            },
          },
        }),
      ),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2AccessKeys.visitPlan(input.requirementId),
      });
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.requirements.timeline(input.requirementId),
      });
    },
    retry: false,
  });
}

export interface ReportNoShowInput extends SiteVisitCommandInput {
  reasonCode: string;
}

/**
 * Reports that the professional did not turn up — `M2-FE-422`.
 *
 * **The party is not a parameter, and that is the point.** You report the other
 * party's absence and never your own: a Customer reports `VENDOR`, and the
 * server answers `403` to the reverse. Offering a control that could send
 * `CUSTOMER` would be offering a refusal, so the value is fixed at the one call
 * site that could set it.
 *
 * A vendor no-show costs the Customer nothing and the slot goes back to owing a
 * free replacement visit. `m2_policy_unavailable` on this path is the *customer*
 * no-show branch the owner has not decided; it cannot arrive from here, and the
 * screen still reads it rather than assuming so.
 */
export function useReportVendorNoShow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReportNoShowInput) =>
      request(() =>
        getApiClient().POST("/api/v1/site-visits/{site_visit_id}/no-show/", {
          params: {
            path: { site_visit_id: input.siteVisitId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-visit-no-show:${input.siteVisitId}`,
              ),
            },
          },
          // `VENDOR`, always. See the note above.
          body: { party: "VENDOR", reason_code: input.reasonCode },
        }),
      ),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2AccessKeys.visitPlan(input.requirementId),
      });
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.requirements.timeline(input.requirementId),
      });
    },
    retry: false,
  });
}
