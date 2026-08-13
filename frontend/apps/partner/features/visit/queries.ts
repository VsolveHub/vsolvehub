"use client";

import {
  ApiRequestError,
  clearIdempotencyKey,
  getStableIdempotencyKey,
  request,
  type Schemas,
} from "@vsolve/api-client";
import { M2_FRESHNESS, m2QueryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";
import type { EnquiryDetail } from "@/features/enquiry/queries";

/**
 * The A5 visit surface: candidate slots, confirmation, arrival and completion
 * (contract 1.24.0).
 *
 * `M2-FE-314` and the guard half of `M2-FE-315`.
 *
 * ## Why the keys are derived rather than added to the factory
 *
 * `packages/query/src/m2-keys.ts` is frozen and carries no `visits` namespace.
 * Rather than edit it mid-wave, the slot grid hangs off the key that already
 * exists for the record it belongs to — `invitations.detail(id)` — with a
 * `visit-slots` tail. That is not a workaround: a slot grid *is* a projection of
 * one invitation, and being inside that prefix means every existing invalidation
 * of the invitation already clears it. The factory addition is requested in
 * `frontend-execution-plan.md` §7.
 *
 * `invalidateForM2Command` is likewise not used here: its `M2Command` union
 * predates revision 3 and names no `confirm_visit_slot`,
 * `confirm_visit_arrival` or `complete_site_visit`. Calling it with a string it
 * does not know would not compile, and inventing a near-miss command name would
 * put the wrong rows in the invalidation table. The invalidations below are
 * written out and the union's extension is requested in the same §7 row.
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

export type VisitSlotGrid = Schemas["VisitSlotGrid"];
export type VisitSlotConfirmation = Schemas["VisitSlotConfirmation"];
export type SiteVisit = Schemas["SiteVisit"];

/** The grid for one invitation, inside that invitation's own key prefix. */
export function visitSlotsKey(invitationId: string) {
  return [...m2QueryKeys.invitations.detail(invitationId), "visit-slots"] as const;
}

/**
 * Candidate visit starts for this vendor on this request.
 *
 * Only mounted where an A5 vendor can actually act — `enabled` is the caller's
 * to decide, because an invitation this vendor has already declined has no grid
 * worth drawing and asking for one spends a guaranteed refusal.
 */
export function usePartnerVisitSlots(invitationId: string, enabled = true) {
  return useQuery({
    queryKey: visitSlotsKey(invitationId),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/partner/enquiries/{invitation_id}/visit-slots/", {
          params: { path: { invitation_id: invitationId } },
        }),
      ),
    enabled: enabled && invitationId !== "",
    ...M2_FRESHNESS.invitationDetail,
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && [400, 401, 403, 404, 409].includes(error.status)
        ? false
        : failureCount < 2,
  });
}

/** One stable key per invitation, for the life of that logical confirmation. */
export function confirmSlotKey(invitationId: string): string {
  return getStableIdempotencyKey(`m2-visit-slot-confirm:${invitationId}`);
}

/**
 * Confirm a slot. **This is A5 acceptance.**
 *
 * It takes the quote slot, the soft capacity hold and a hard reservation on the
 * shared availability grid in one command, so the whole enquiry inbox is
 * invalidated on success rather than this row: confirming here changes which
 * *other* enquiries and A1 offers this vendor can still take.
 *
 * `retry: false` for a reason stronger than the usual one. A retry would resend
 * a token that the ordinary failure mode — `m2_visit_slot_unavailable` — has
 * already told us is dead, so it would burn a round trip to earn the same
 * refusal. The recovery is a fresh grid.
 */
export function useConfirmVisitSlot(invitationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { readonly slotToken: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/enquiries/{invitation_id}/visit-slots/", {
          params: {
            path: { invitation_id: invitationId },
            header: { "Idempotency-Key": confirmSlotKey(invitationId) },
          },
          // The token, exactly as the grid published it. Never reconstructed.
          body: { slot_id: input.slotToken },
        }),
      ),
    onSuccess: async (confirmation) => {
      applyVisitToEnquiry(queryClient, invitationId, confirmation.visit);
      clearIdempotencyKey(`m2-visit-slot-confirm:${invitationId}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: m2QueryKeys.invitations.all }),
        queryClient.invalidateQueries({ queryKey: visitSlotsKey(invitationId) }),
      ]);
    },
    onError: () => {
      // The grid is what was wrong, whatever the refusal was. Re-reading it is
      // the only recovery that can produce a token the server will take.
      void queryClient.invalidateQueries({ queryKey: visitSlotsKey(invitationId) });
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.invitations.detail(invitationId),
      });
    },
    retry: false,
  });
}

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
 * Record that the vendor is on site.
 *
 * The **non-OTP fallback is the default path in M2, not a degraded one** — the
 * start OTP is M3 activation — and `arrival_method` is stored so a historical
 * arrival still says truthfully how it was proved once OTP is switched on. Either
 * party may confirm, so a second confirmation from the customer is not a
 * conflict.
 */
export function useConfirmVisitArrival(invitationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { readonly siteVisitId: string }) =>
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
    onSuccess: (visit, input) => {
      applyVisitToEnquiry(queryClient, invitationId, visit);
      clearIdempotencyKey(`m2-visit-arrival:${input.siteVisitId}`);
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
    onSuccess: (visit, input) => {
      applyVisitToEnquiry(queryClient, invitationId, visit);
      clearIdempotencyKey(`m2-visit-complete:${input.siteVisitId}`);
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
          // `reason_code` is a free `CharField` with no published vocabulary,
          // and it is declared required with an empty default. Sent blank
          // rather than authored: a slug invented here would become the value
          // Operations reports on, and two clients would invent it differently.
          // Requested in `frontend-execution-plan.md` §7.
          body: { party: "CUSTOMER", reason_code: "" },
        }),
      ),
    onSuccess: (visit, input) => {
      applyVisitToEnquiry(queryClient, invitationId, visit);
      clearIdempotencyKey(`m2-visit-no-show:${input.siteVisitId}`);
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
