"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { M2_FRESHNESS, boundedPoll, invalidateForM2Command, m2QueryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { getApiClient } from "@/lib/api/browser";

import { isOfferAnswerable } from "./model/offer-state";

/**
 * The A3 crew-offer surface: the cascade inbox and its two commands
 * (contract 1.29.0).
 *
 * `M2-FE-316`. This is the **primary** A3 path under ADR-0009 revision 4. The
 * enquiry inbox beside it (`features/enquiry/**`) is the thin-supply fallback and
 * stays exactly as built — nothing here replaces it.
 *
 * ## The key is composed locally, under an existing prefix
 *
 * `m2-keys.ts` is frozen for this wave and carries no `crewOffers` namespace and
 * no `accept_crew_offer` / `decline_crew_offer` command. Rather than edit it, the
 * list is keyed `m2QueryKeys.invitations.list("crew-offers")` — a **bucket** of
 * the invitation inbox, which is what a crew offer is: `07-state-machines.md` §2
 * says plainly that "the invitation is a crew offer" on the A3 rate-card path,
 * and the server projects it from the same `VendorInvitation` row.
 *
 * That choice is what keeps invalidation honest. Every existing rule that clears
 * `invitations.all` — including `accept_invitation` and `decline_invitation`,
 * which are the §6 rows these two commands specialise — clears this list by
 * prefix. Confirming a visit slot on the A5 side takes a capacity hold and
 * already invalidates `invitations.all`, so it correctly drops a crew offer this
 * vendor can no longer serve, without either module knowing about the other.
 *
 * The two named commands are requested in `frontend-execution-plan.md` §7.
 *
 * ## Neither command takes an idempotency key, and that is the contract
 *
 * `m2_crew_offer_accept` and `m2_crew_offer_decline` declare no
 * `Idempotency-Key` header, which matches §6: both are marked **Natural** rather
 * than **Key**. Accept is naturally idempotent on the invitation — first accept
 * wins and a second call against a won offer is refused, not doubled — and
 * decline moves a one-way status. So `retry: false` on both is doing real work
 * here: an automatic retry has no key to make it safe, and the honest recovery
 * from an ambiguous failure is to re-read the inbox, because `status` is the only
 * thing that knows.
 */

export type CrewOffer = Schemas["CrewOffer"];
export type CrewOfferList = Schemas["CrewOfferList"];
/** What accepting answers with since 1.30.0 — see `model/offer-state.ts`. */
export type CrewOfferAccepted = Schemas["CrewOfferAccepted"];

/**
 * The crew-offer bucket of the invitation inbox.
 *
 * A named function rather than an inline literal at three call sites, which is
 * the rule `keys.ts` exists to enforce: a key built inline is how invalidation
 * silently stops working.
 */
export function crewOffersKey() {
  return m2QueryKeys.invitations.list("crew-offers");
}

/**
 * True once nothing in the loaded list can move on its own.
 *
 * Copied from the A1 offer inbox's own guard, including the part that looks like
 * a mistake: an **empty** list is deliberately not settled. `[].every(…)` is
 * `true`, so without the length check a lead with no offers would stop watching
 * at precisely the moment they are waiting for work to arrive — and crew offers
 * are pushed by the cascade, not caused by anything on this page.
 */
function inboxIsSettled(data: CrewOfferList): boolean {
  return data.offers.length > 0 && !data.offers.some(isOfferAnswerable);
}

/**
 * Live crew offers for this lead.
 *
 * `EXPIRING_STATE` through `M2_FRESHNESS.invitationList`, which is the tier a
 * response deadline earns — and this deadline is stricter than the tier was
 * written for: `responds_by` on a crew offer is wall-clock and minutes away.
 *
 * **Polled, unlike the enquiry inbox.** That inbox is deliberately not polled
 * because a business-hours deadline moves once a day. This one rides the M1
 * dispatch clock: waves arrive while the lead is looking at the screen, and an
 * offer another lead accepts stops being returned at all — the server filters to
 * `INVITED`. Fifteen seconds sits between the A1 offer inbox's five (an offer
 * expiring in seconds) and the shared recovery interval (a screen that barely
 * moves). Hidden tabs pause it; a failing endpoint backs it off.
 */
export function usePartnerCrewOffers(enabled = true) {
  return useQuery({
    queryKey: crewOffersKey(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/crew-offers/")),
    enabled,
    ...M2_FRESHNESS.invitationList,
    ...boundedPoll<CrewOfferList>({ intervalMs: 15_000, isSettled: inboxIsSettled }),
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && [401, 403].includes(error.status)
        ? false
        : failureCount < 2,
  });
}

/**
 * Re-reads instead of guessing.
 *
 * A failed command may or may not have applied — a timeout after Django committed
 * looks identical to one before it — and with no idempotency key there is nothing
 * to replay. So both commands send the inbox to go and look.
 */
function useRereadOnAmbiguity() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: m2QueryKeys.invitations.all });
  }, [queryClient]);
}

/**
 * Where the server's answer is handed to a caller that outlives the row.
 *
 * ## The defect this parameter exists to prevent
 *
 * `GET /partner/crew-offers/` filters `status=INVITED` server-side. So the moment
 * either command succeeds, the offer it answered **stops being returned at all**.
 * Both commands then invalidate `invitations.all`, which refetches this very list.
 *
 * A component that rendered its own outcome from `mutation.data` would therefore
 * render it for one frame and then unmount, because the row it is keyed by has
 * left the array — and where it was the lead's only offer, the empty state
 * ("No jobs waiting on you right now") replaces the panel that just told them
 * they had won a job. On this screen that is the worst reachable outcome: **"do
 * not travel yet"** is the sentence the whole task exists to say, and it would be
 * the sentence that flashes.
 *
 * So the outcome is handed **upward, synchronously, before the invalidation is
 * awaited** — while the caller is still mounted and can store it somewhere the
 * refetch cannot reach. It is not a notification hook; it is the only moment the
 * answer is guaranteed to be deliverable.
 *
 * Deliberately **not** solved with `setQueryData`. Writing the answered row back
 * into a cache the next line invalidates is two mechanisms owning one fact, and
 * the server would win the race anyway.
 */
export interface CrewOfferAnswerHandlers {
  /** The booking that accepting produced. Held or confirmed — the server decides which. */
  readonly onAccepted?: (booking: CrewOfferAccepted) => void;
  /**
   * The offer in its `DECLINED` state, beside the input that produced it.
   *
   * The input is handed back because `CrewOffer` publishes no `reason_code` at
   * any status, so the code the lead chose is only knowable from what was sent.
   */
  readonly onDeclined?: (offer: CrewOffer, input: CrewOfferDeclineInput) => void;
}

/**
 * Take the job at the published rate.
 *
 * **First accept wins.** A rate-card request has exactly one slot, so the second
 * lead to arrive is refused with `m2_invitation_slots_exhausted` rather than
 * losing a silent race — which is what makes the refusal worth wording well
 * rather than hiding.
 *
 * The whole inbox is invalidated on success rather than this row, and for the
 * same reason `accept_invitation` has always done it: acceptance takes a
 * roster-sized capacity hold over the requested dates, which changes which
 * *other* offers, enquiries and A1 jobs this vendor can still take.
 *
 * `accept_invitation` is the §6 row this specialises, and it is what
 * `invalidateForM2Command` is given until the named command lands (plan §7).
 */
export function useAcceptCrewOffer(
  invitationId: string,
  handlers: CrewOfferAnswerHandlers = {},
) {
  const queryClient = useQueryClient();
  const reread = useRereadOnAmbiguity();

  return useMutation({
    mutationFn: () =>
      request(() =>
        getApiClient().POST("/api/v1/partner/crew-offers/{invitation_id}/accept/", {
          params: { path: { invitation_id: invitationId } },
        }),
      ),
    onSuccess: async (booking) => {
      // Before the invalidation, never after. See `CrewOfferAnswerHandlers`.
      handlers.onAccepted?.(booking);
      await invalidateForM2Command(queryClient, "accept_invitation", { invitationId });
    },
    onError: reread,
    retry: false,
  });
}

export interface CrewOfferDeclineInput {
  /**
   * A published code, never a free slug.
   *
   * Typed against `CrewOfferDeclineReasonCodeEnum`, so a hand-written string
   * fails the type check here rather than reaching the serializer's `400`.
   */
  readonly reasonCode: Schemas["CrewOfferDeclineReasonCodeEnum"];
  /** Optional free text beside the code. The code is what the alarm groups on. */
  readonly note?: string;
}

/**
 * Pass on the offer, with the reason that feeds the decline-rate alarm.
 *
 * Declining releases the slot and moves the cascade to its next, wider wave, so
 * the inbox — not this row — is what changes. The response carries the whole
 * `CrewOffer` in its `DECLINED` state, and it is handed up through `onDeclined`
 * so the screen can keep showing what the lead just did after the server has
 * stopped returning the row.
 */
export function useDeclineCrewOffer(
  invitationId: string,
  handlers: CrewOfferAnswerHandlers = {},
) {
  const queryClient = useQueryClient();
  const reread = useRereadOnAmbiguity();

  return useMutation({
    mutationFn: (input: CrewOfferDeclineInput) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/crew-offers/{invitation_id}/decline/", {
          params: { path: { invitation_id: invitationId } },
          body: { reason_code: input.reasonCode, note: input.note ?? "" },
        }),
      ),
    onSuccess: async (declined, input) => {
      // Before the invalidation, never after. See `CrewOfferAnswerHandlers`.
      handlers.onDeclined?.(declined, input);
      await invalidateForM2Command(queryClient, "decline_invitation", { invitationId });
    },
    onError: reread,
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   Refusals worth naming
   --------------------------------------------------------------------------- */

/**
 * The lead's **verified** roster is smaller than the requested headcount.
 *
 * The one refusal on this screen that is fixable by the vendor, which is why it
 * is routed to the crew roster rather than to a generic banner. Crews are never
 * aggregated across vendors — ADR-0009 forbids it, because a crew assembled from
 * strangers has no accountable party — so the fix is always the same: verify more
 * of your own people.
 *
 * Not in the frozen `errors.ts` map, so it falls through to the generic refusal
 * path there. Handled explicitly at the call site meanwhile, and requested in
 * `frontend-execution-plan.md` §7.
 */
export function isRosterInsufficient(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_roster_insufficient";
}

/** Another lead answered first. The job is gone; nothing counts against you. */
export function isOfferTaken(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_invitation_slots_exhausted";
}

/** This vendor is already committed on those dates, on the shared availability grid. */
export function isCapacityUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_capacity_unavailable";
}

/** The dispatch clock ran out before the answer landed. */
export function isOfferExpired(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_invitation_expired";
}

/** The progressive-KYC gate, fired at the first real commitment rather than at signup. */
export function isKycRequired(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_kyc_required";
}

/** No approved A3 capability, or Operations suspended it. */
export function isCapabilityRefusal(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.code === "m2_capability_not_approved" || error.code === "m2_capability_suspended")
  );
}
