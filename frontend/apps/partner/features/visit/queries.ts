"use client";

import {
  ApiRequestError,
  clearIdempotencyKey,
  getStableIdempotencyKey,
  request,
  type Schemas,
} from "@vsolve/api-client";
import { invalidateForM2Command, m2QueryKeys } from "@vsolve/query";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";
import type { EnquiryDetail } from "@/features/enquiry/queries";

/**
 * The A5 visit surface: candidate slots, confirmation, arrival and completion
 * (contract 1.24.0).
 *
 * `M2-FE-314` and the guard half of `M2-FE-315`.
 *
 * ## The keys are the published ones, as of the Wave I gate
 *
 * `m2-keys.ts` now carries a `visits` namespace and the seven visit commands, so
 * the local composition this file used to carry — `invitations.detail(id)` with a
 * `visit-slots` tail — is gone and `m2QueryKeys.visits.slots(invitationId)` is
 * used instead. Worth keeping the factory's own reasoning in view: **the grid is
 * keyed by invitation and deliberately not nested under the plan**, because it is
 * one vendor's diary and two vendors on the same plan see different grids.
 *
 * `invalidateForM2Command` is likewise live for all four commands below, so the
 * cache effects of a visit command are in the one reviewable table rather than
 * written out at four call sites. Where a call site still invalidates explicitly
 * it is because it invalidates *more* than the command's own rows — confirming a
 * slot changes which other enquiries this vendor can take — and that is a fact
 * about the invitation inbox, not about the visit.
 *
 * ## Every read is EXPIRING_STATE, and the slot grid especially
 *
 * A slot `id` is a **signed token** bound to this invitation and this start, and
 * it expires. A picker left open on a phone in a pocket for ten minutes is
 * holding tokens the server will refuse, so the grid is never served stale, is
 * dropped from memory quickly, and revalidates on focus and reconnect. The
 * recovery from `m2_visit_slot_unavailable` is to re-read and pick again —
 * **never** to resend the same id, which is why the confirm mutation does not
 * retry.
 */

export type SiteVisit = Schemas["SiteVisit"];

// Partner visit-slot selection was removed from the contract at 1.44.0.
//
// `visitSlotsKey`, `usePartnerVisitSlots`, `confirmSlotKey` and
// `useConfirmVisitSlot` lived here, against
// `/api/v1/partner/enquiries/{invitation_id}/visit-slots/`. That endpoint no
// longer exists: BE-2 moved the choice of time to the customer, and a partner
// now answers a fixed offer through `/enquiries/{id}/accept/`. See
// `view/fixed-time-offer.tsx` for what replaced the picker.


/**
 * Writes a visit straight into the enquiry that owns it.
 *
 * The commands answer with the whole `SiteVisit`, so the new state is already in
 * hand and the screen renders it on the frame the button settles rather than
 * flashing a skeleton over the record the vendor just moved.
 */
function applyVisitToEnquiry(
  queryClient: ReturnType<typeof useQueryClient>,
  invitationId: string,
  visit: SiteVisit,
): void {
  queryClient.setQueryData<EnquiryDetail>(
    m2QueryKeys.invitations.detail(invitationId),
    (detail) => {
      if (!detail) return detail;
      const known = detail.site_visits.some((row) => row.id === visit.id);
      return {
        ...detail,
        site_visits: known
          ? detail.site_visits.map((row) => (row.id === visit.id ? visit : row))
          : [...detail.site_visits, visit],
      };
    },
  );
}

/**
 * Arrival proved by the code the customer is holding — contract 1.39.0.
 *
 * The only arrival path. Keeping the code on its own required request body means
 * a visit cannot be started by a weaker tap-only command.
 *
 * ## Why a stable idempotency key is safe here
 *
 * Double-tapping "start the visit" must not be two commands. A wrong code raises,
 * and the raise rolls the idempotency record back with it, so a corrected retry
 * is a fresh command rather than a replay of the refusal. The server's fingerprint
 * covers the visit and deliberately *not* the code, which is what stops a
 * corrected retry being rejected as key reuse.
 */
export function useConfirmVisitArrivalWithCode(invitationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { readonly siteVisitId: string; readonly code: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/site-visits/{site_visit_id}/arrival/", {
          params: {
            path: { site_visit_id: input.siteVisitId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-visit-arrival-code:${input.siteVisitId}`,
              ),
            },
          },
          body: { code: input.code },
        }),
      ),
    onSuccess: async (visit, input) => {
      applyVisitToEnquiry(queryClient, invitationId, visit);
      clearIdempotencyKey(`m2-visit-arrival-code:${input.siteVisitId}`);
      await invalidateForM2Command(queryClient, "confirm_visit_arrival", {
        siteVisitId: input.siteVisitId,
      });
    },
    onError: () => {
      // A wrong code is the ordinary case here, not an outage, and the challenge
      // it just spent an attempt on lives server-side. Re-reading the enquiry is
      // what keeps the panel honest if the customer confirmed from their side
      // while the vendor was typing.
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.invitations.detail(invitationId),
      });
    },
    retry: false,
  });
}

/**
 * Close the visit.
 *
 * Only the vendor can, because only the vendor attended it — scheduling takes
 * both parties, completion is a report of what happened. Completing a plan visit
 * stamps `estimate_due_at`, the window the estimate has to land inside, so this
 * is the command that starts the clock the composer counts against.
 */
export function useCompleteVisit(invitationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { readonly siteVisitId: string; readonly outcomeNotes?: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/site-visits/{site_visit_id}/complete/", {
          params: {
            path: { site_visit_id: input.siteVisitId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-visit-complete:${input.siteVisitId}`,
              ),
            },
          },
          body: { outcome_notes: input.outcomeNotes ?? "" },
        }),
      ),
    onSuccess: async (visit, input) => {
      applyVisitToEnquiry(queryClient, invitationId, visit);
      clearIdempotencyKey(`m2-visit-complete:${input.siteVisitId}`);
      await invalidateForM2Command(queryClient, "complete_site_visit", {
        siteVisitId: input.siteVisitId,
      });
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.invitations.detail(invitationId),
      });
    },
    retry: false,
  });
}

/**
 * Report that nobody was on site.
 *
 * **You report the other party's absence, never your own.** A vendor sends
 * `CUSTOMER` and the server refuses `VENDOR` from this side, so the party is
 * fixed here rather than offered as a choice — a dropdown containing an option
 * the server always refuses is a trap.
 */
export function useReportCustomerNoShow(invitationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { readonly siteVisitId: string }) =>
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
          // The §7 request was granted at 1.26.0: `reason_code` is now
          // `VisitNoShowReasonEnum` and required, so the blank this used to send
          // would be a `400`. `NOBODY_ON_SITE` is the vendor's own report — they
          // travelled and found nobody there, which is the only customer no-show
          // this control can express. The other members belong to the Customer's
          // side of the same endpoint or to Operations.
          body: { party: "CUSTOMER", reason_code: "NOBODY_ON_SITE" },
        }),
      ),
    onSuccess: async (visit, input) => {
      applyVisitToEnquiry(queryClient, invitationId, visit);
      clearIdempotencyKey(`m2-visit-no-show:${input.siteVisitId}`);
      await invalidateForM2Command(queryClient, "report_visit_no_show", {
        siteVisitId: input.siteVisitId,
      });
    },
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   Refusals worth naming
   --------------------------------------------------------------------------- */

/**
 * The slot is gone, the token is stale, or the start is now in the past.
 *
 * The recovery is always the same and never a retry: re-read the grid and pick
 * another time. `errors.ts` categorises it `choose_again` for exactly that.
 */
export function isSlotUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_visit_slot_unavailable";
}

/** The customer has not chosen a visit plan, so there is no slot to take. */
export function isVisitPlanRequired(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_visit_plan_required";
}

/** This vendor is already committed elsewhere on the shared availability grid. */
export function isCapacityUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_capacity_unavailable";
}

/** Every plan slot is taken — other vendors answered first. */
export function isSlotsExhausted(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_invitation_slots_exhausted";
}

/** Only project requests book visit slots. A workforce request has no grid. */
export function isNotAVisitLifecycle(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_lifecycle_not_supported";
}

/** The progressive-KYC gate, fired at the first real commitment. */
export function isKycRequired(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_kyc_required";
}

/**
 * A rule the owner has not decided yet, read fail-closed.
 *
 * On the grid it means nobody has set how long a visit takes for this service,
 * so the grid cannot be drawn at an invented width. It is not a fault the vendor
 * can fix and it must not be dressed up as one.
 */
export function isPolicyUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_policy_unavailable";
}

/** The A5 estimate guard: no completed visit stands behind this submission. */
export function isVisitNotCompleted(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_visit_not_completed";
}
