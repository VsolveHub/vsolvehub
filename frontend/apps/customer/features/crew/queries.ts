"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearIdempotencyKey,
  getStableIdempotencyKey,
  request,
} from "@vsolve/api-client";
import {
  CREW_VENDOR_NO_SHOW_REASON,
  CUSTOMER_REPORTS_CREW_PARTY,
  M2_FRESHNESS,
  boundedPoll,
  invalidateForM2Command,
  isRateCardSettled,
  m2QueryKeys,
  m2RateCardKeys,
  shouldRetryM2Read,
  type BookingFee,
  type RateCardState,
} from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The A3 instant door — contract 1.29.0, revision 4 (ADR-0009).
 *
 * `GET`/`POST /requirements/{id}/rate-card/`, the booking-fee checkout and
 * cancel, and the two day-one crew commands. The same split every M2 feature in
 * this app uses: the durable, React-free half is `packages/query/src/m2-quotes.ts`
 * and this file is its call site.
 *
 * ## One read for the whole path, and it is the only truth about the money
 *
 * `RateCardState` carries the price before booking, the booking through the
 * cascade and the fee after, because — in the server's own words on
 * `VisitPlanStateSerializer` — the screen that offers instant booking and the
 * screen that tracks it are **the same screen at two moments**. Three endpoints
 * would let them disagree about which booking the Customer has.
 *
 * Nothing in this file decides whether a Customer has paid for anything.
 * `bookingFeePhase` and `bookingPhase` in `@vsolve/query` read that off the
 * server's own record, and every screen renders from those.
 *
 * ## Why the read polls, and when it stops
 *
 * Two unsettled states, both argued on `isRateCardSettled`: a fee awaiting its
 * **verified provider callback**, and a cascade that is still out. The A3
 * cascade runs on the M1 dispatch clock in minutes rather than the hours a quote
 * wave takes, so a holding state that never moved without a manual refresh would
 * be lying about being live.
 *
 * ## Why there is no payment-attempt read here either
 *
 * The same reason `features/access/queries.ts` gives, unchanged for the booking
 * fee: `GET /api/v1/payment-attempts/{id}/` resolves ownership through
 * `checkout__customer`, and an M2 charge is created with `checkout=None`, so the
 * endpoint answers `404` for every attempt this app creates. `AccessCheckout` is
 * used for exactly what it is — proof that an attempt exists and the provider
 * handoff values — and the **state read** is the whole recovery path.
 */

export type { RateCardState, BookingFee };

/* --------------------------------------------------------------------------
   The read
   -------------------------------------------------------------------------- */

/**
 * The rate, the crew and the fee — `M2-FE-425..429`.
 *
 * Also the browser-close recovery path: a Customer who comes back on another
 * device holds a requirement id and nothing else, and this answers from that
 * alone.
 *
 * `enabled` exists because the endpoint is A3-only. Mounting it on an A5 request
 * would put a refusal on every project request detail, and ignored noise is
 * where a real refusal hides.
 */
export function useRateCardState(requirementId: string | null, enabled = true) {
  return useQuery({
    queryKey: m2RateCardKeys.state(requirementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/requirements/{requirement_id}/rate-card/", {
          params: { path: { requirement_id: requirementId! } },
        }),
      ),
    enabled: requirementId !== null && enabled,
    // The access tier: money in flight, then a confirmation that can be refunded
    // out from under it. `M2_FRESHNESS` has no rate-card entry — `m2-keys.ts`
    // predates revision 4 and is frozen — and this is the tier it argues for,
    // exactly as the visit plan borrowed it in Wave A2.
    ...M2_FRESHNESS.unlock,
    ...boundedPoll<RateCardState>({ isSettled: isRateCardSettled }),
    retry: shouldRetryM2Read,
  });
}

/**
 * The published rate at a size the draft has not been saved at — `M2-FE-426`.
 *
 * What lets the booking screen hold the price beside the form and keep it right
 * while the Customer changes their mind, instead of making them press "see the
 * rate" and watch a screen change.
 *
 * ## Why this asks the server rather than multiplying
 *
 * The arithmetic is trivial — the rate is per worker per day and the total is
 * linear in both — and that is exactly the trap. `features/crew/adapters` is
 * explicit that nothing on this path may print a figure the server did not send,
 * because the day rate, the wage half and the booking-fee component are three
 * separately published numbers whose relationship is the card's to define and
 * not this client's to assume. So the size goes up as two query parameters and
 * the whole priced answer comes back.
 *
 * ## It prices; it cannot book
 *
 * `rate-card/book/` still reads the size off the stored draft, so a size
 * previewed here and never saved cannot become a purchase. The screen writes the
 * draft once, when the Customer books.
 *
 * ## No polling
 *
 * `useRateCardState` polls because it is watching a cascade and a payment
 * settle. Nothing here is in flight — it is a price for a form — so this is a
 * plain read, and `placeholderData` keeps the previous figures on screen while
 * the next size is fetched. A rail that blanks on every press of a stepper is
 * worse than one that lags by a moment.
 */
export function useRateCardPreview(
  requirementId: string | null,
  size: { headcount: number; days: number } | null,
) {
  const headcount = size?.headcount ?? 0;
  const days = size?.days ?? 0;

  return useQuery({
    queryKey: m2RateCardKeys.preview(requirementId ?? "", headcount, days),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/requirements/{requirement_id}/rate-card/", {
          params: {
            path: { requirement_id: requirementId! },
            query: { headcount, days },
          },
        }),
      ),
    enabled: requirementId !== null && size !== null,
    // Keeps the last size's figures rendered while the next one loads, so the
    // rail dims rather than empties. The screen pairs this with `isFetching` to
    // mark the stale figures busy — showing them *without* saying so would be
    // presenting one size's price as another's.
    placeholderData: (previous) => previous,
    ...M2_FRESHNESS.unlock,
    retry: shouldRetryM2Read,
  });
}

/* --------------------------------------------------------------------------
   Booking at the published rate — `M2-FE-425`
   -------------------------------------------------------------------------- */

const BOOK_SCOPE = "m2-rate-card-book";

/**
 * The stable key for booking one requirement at the published rate.
 *
 * Keyed on the requirement alone, on `submitIntentKey`'s reasoning: booking is a
 * once-per-requirement transition — `DRAFT` to `MATCHING` and never back — so
 * every press of the same button for the same requirement *is* the same command,
 * and replaying it after a dropped connection is the behaviour wanted.
 */
export function bookAtRateKey(requirementId: string): string {
  return getStableIdempotencyKey(`${BOOK_SCOPE}:${requirementId}`);
}

/**
 * Spends the stored booking key, so the next press is a new command.
 *
 * Called at the **moment of the decision** — the Customer reading a duplicate
 * warning and saying the two jobs differ — and deliberately not inside the
 * mutation. `allow_duplicate` travels in the body and not in the key, so the
 * override would otherwise be sent under the key the *refused* attempt already
 * spent; `execute_idempotent` fingerprints the payload and refuses a reused key
 * carrying a different one, so the Customer would press "these are different
 * jobs", press book, and be told the same thing forever.
 *
 * Once, at the decision, rather than on every send: a dropped connection during
 * the override still replays under the new key, which is the whole reason the
 * key is stable. Clearing on each `mutate` would give the retry a third key.
 */
export function clearBookAtRateKey(requirementId: string): void {
  clearIdempotencyKey(`${BOOK_SCOPE}:${requirementId}`);
}

export interface BookAtPublishedRateInput {
  requirementId: string;
  /** Set only after the Customer saw a probable duplicate and said they differ. */
  allowDuplicate: boolean;
}

/**
 * Books a crew at the published day rate — `M2-FE-425`.
 *
 * **Charges nothing.** It submits the requirement and sends the first wave of
 * crew offers; the booking fee is charged only once a lead has accepted. The
 * rate and its inclusion list were on screen before this ran and are frozen onto
 * the booking here, so a card loaded between the screen and the tap cannot
 * become what the Customer agreed to.
 *
 * No auto-retry. `m2_rate_card_unavailable` (no card for this city and skill)
 * and `m2_policy_unavailable` (instant dispatch is not set up for this service)
 * are both states the Customer has to read, and neither changes on a resend —
 * the honest recovery for both is the quote flow.
 *
 * Overriding a duplicate warning is a second, different decision and the screen
 * spends the stored key when the Customer makes it — see `clearBookAtRateKey`.
 */
export function useBookAtPublishedRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BookAtPublishedRateInput) =>
      request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/rate-card/book/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: { "Idempotency-Key": bookAtRateKey(input.requirementId) },
          },
          body: { allow_duplicate: input.allowDuplicate },
        }),
      ),
    onSuccess: (state: RateCardState, input) => {
      // The response *is* the new state, so it is written straight in rather
      // than re-fetched. The requirement itself moved DRAFT -> MATCHING, so its
      // own record and the list both have to be re-read.
      queryClient.setQueryData(m2RateCardKeys.state(input.requirementId), state);
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.requirements.all });
    },
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   The booking fee — `M2-FE-428`
   -------------------------------------------------------------------------- */

const FEE_CHECKOUT_SCOPE = "m2-booking-fee-checkout";

/**
 * The stable key for paying one booking's fee.
 *
 * Keyed on the **booking**, not the requirement, exactly as
 * `visitPlanCheckoutKey` is keyed on the plan. A vendor no-show returns the
 * requirement to matching for a free re-dispatch, and a key that outlived the
 * booking it was minted for would replay the first booking's checkout against
 * the second one.
 *
 * Persisted through `getStableIdempotencyKey`, which is what makes a lost
 * provider redirect resume the original attempt rather than open a second one.
 */
export function bookingFeeCheckoutKey(bookingId: string): string {
  return getStableIdempotencyKey(`${FEE_CHECKOUT_SCOPE}:${bookingId}`);
}

export interface StartBookingFeeCheckoutInput {
  requirementId: string;
  bookingId: string;
  /**
   * True only when the server's own record says the last charge `FAILED`.
   *
   * The one case where pressing again is a genuinely *new* command: replaying
   * the stored key would hand back the persisted `201` describing the attempt
   * that already failed, and the screen would sit waiting on a payment nobody
   * restarted. Passed in rather than read here, so nothing in this file can
   * decide on its own that a charge failed.
   */
  isRetryAfterFailure: boolean;
}

/**
 * Starts the booking-fee charge — `M2-FE-428`.
 *
 * Offered **only** against a held accepted offer; `m2_booking_fee_not_chargeable`
 * (409) is what a lapsed hold answers. The `201` carries an `AccessCheckout`,
 * which says an attempt exists and **nothing more** — the crew is confirmed and
 * the engagement created only by the verified provider callback, and
 * `useRateCardState` is what says whether that has happened.
 */
export function useStartBookingFeeCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartBookingFeeCheckoutInput) => {
      if (input.isRetryAfterFailure) {
        clearIdempotencyKey(`${FEE_CHECKOUT_SCOPE}:${input.bookingId}`);
      }
      return request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/booking-fee/checkout/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: { "Idempotency-Key": bookingFeeCheckoutKey(input.bookingId) },
          },
        }),
      );
    },
    // Success and failure alike. A `201` means an attempt exists and the fee has
    // moved to `PENDING`; a refusal usually means the world moved (the hold
    // lapsed, the request closed), and the screen has to be re-rendered from
    // what is actually there either way.
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2RateCardKeys.state(input.requirementId),
      });
    },
    retry: false,
  });
}

export interface CancelBookingInput {
  requirementId: string;
}

/**
 * Cancels a booked crew — `M2-FE-429`.
 *
 * **The client never decides which way the money goes.** The free-cancellation
 * window T is server configuration read fail-closed: at or beyond T hours before
 * the start the fee refunds in full, inside T it forfeits and splits, and while
 * T is unset the command refuses with `m2_policy_unavailable` rather than
 * guessing whose money it is. The response is the settled `BookingFee`, and the
 * screen reads the outcome off that record rather than predicting it.
 */
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CancelBookingInput) =>
      request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/booking-fee/cancel/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-booking-fee-cancel:${input.requirementId}`,
              ),
            },
          },
        }),
      ),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2RateCardKeys.state(input.requirementId),
      });
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.requirements.detail(input.requirementId),
      });
    },
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   Nobody accepted — the Customer's three ways out
   -------------------------------------------------------------------------- */

export interface RateCardRecoveryInput {
  requirementId: string;
}

/**
 * The three commands reachable from `EXHAUSTED`, and nothing else.
 *
 * They share a factory because they share a shape — one path parameter, one
 * stable key, the same two invalidations — and differ only in which door they
 * open. What they must **not** share is a single endpoint taking an action
 * string: "cancel my request" and "keep looking" would then be one typo apart on
 * the wire, and the server could not describe their refusals separately.
 *
 * `retry: false` on all three for the reason the rest of this file uses it: each
 * refusal here is a state the Customer has to read — the cascade restarted under
 * them, a lead accepted while they were deciding — and none changes on a resend.
 */
function useRateCardRecovery(
  path:
    | "/api/v1/requirements/{requirement_id}/rate-card/retry/"
    | "/api/v1/requirements/{requirement_id}/rate-card/quotes/"
    | "/api/v1/requirements/{requirement_id}/rate-card/cancel/",
  scope: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RateCardRecoveryInput) =>
      request(() =>
        getApiClient().POST(path, {
          params: {
            path: { requirement_id: input.requirementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `${scope}:${input.requirementId}`,
              ),
            },
          },
        }),
      ),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2RateCardKeys.state(input.requirementId),
      });
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.requirements.detail(input.requirementId),
      });
    },
    retry: false,
  });
}

/**
 * Search wider, at the same published rate.
 *
 * **There is no price control here and there must not be one.** The A3 day rate
 * is an Operations-published card above a statutory wage floor, and its wage half
 * is paid to the crew directly in cash at day end — money this platform never
 * holds. A "pay more" button would advertise a rate nobody could enforce, on top
 * of the rule that a partner may never charge above the card. The server widens
 * the search instead, which is what thin supply usually needs.
 */
export function useRetryCrewSearch() {
  return useRateCardRecovery(
    "/api/v1/requirements/{requirement_id}/rate-card/retry/",
    "m2-rate-card-retry",
  );
}

/** Take quotes instead. The transition that used to happen without being asked. */
export function useChooseQuotesInstead() {
  return useRateCardRecovery(
    "/api/v1/requirements/{requirement_id}/rate-card/quotes/",
    "m2-rate-card-quotes",
  );
}

/**
 * Stop looking and close the request. Free, and the server proves it rather than
 * promising it: this refuses any state but `EXHAUSTED`, where no lead accepted
 * and so no booking fee was ever written.
 *
 * Not to be confused with `useCancelBooking`, which cancels a crew that *was*
 * booked and has real money behind it.
 */
export function useCancelUnmatchedRequest() {
  return useRateCardRecovery(
    "/api/v1/requirements/{requirement_id}/rate-card/cancel/",
    "m2-rate-card-cancel",
  );
}

/* --------------------------------------------------------------------------
   Day one — `M2-FE-429`
   -------------------------------------------------------------------------- */

export interface CrewDayInput {
  requirementId: string;
}

/**
 * Confirms the crew arrived — the non-OTP path.
 *
 * **The default in M2, not a degraded one.** The start OTP is M3 activation.
 * Either party may record it; this is the Customer's side. It is also the moment
 * the booking fee is earned, which is why the response is the fee itself.
 */
export function useConfirmCrewArrival() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CrewDayInput) =>
      request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/crew/arrival/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-crew-arrival:${input.requirementId}`,
              ),
            },
          },
        }),
      ),
    // `confirm_shift_arrival` landed in `M2_INVALIDATION` at the Gate 3
    // integration, so the rate-card half now goes through the published table
    // rather than being named here.
    //
    // **The timeline invalidation stays, and it is not redundant.** With only a
    // requirement id in hand the table resolves to `rateCard.state(id)` alone —
    // `stageScope` contributes nothing without an engagement or stage id — and
    // `requirements.timeline(id)` is that key's *sibling* under
    // `requirements.detail(id)`, not its child, so no prefix of the table's
    // answer reaches it. Checked in the factory rather than assumed. Arrival is
    // a timeline event, so dropping this line would leave the record a day
    // behind on the one screen a Customer looks at to see it.
    onSettled: (_data, _error, input) => {
      void invalidateForM2Command(queryClient, "confirm_shift_arrival", {
        requirementId: input.requirementId,
      });
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.requirements.timeline(input.requirementId),
      });
    },
    retry: false,
  });
}

/**
 * Reports that the crew did not turn up — `M2-FE-429`.
 *
 * **The party is not a parameter, and that is the point.** `party` decides the
 * money and the reason code cannot move it: `VENDOR` refunds the whole fee, pays
 * no travel compensation, returns the request to matching for a free re-dispatch
 * and hits the vendor's standing. Unlike the visit path, the server does **not**
 * refuse a party reporting its own absence here — so offering a control that
 * could send `CUSTOMER` would be offering a Customer a button that forfeits
 * their own money. The value is fixed at this one call site.
 */
export function useReportCrewNoShow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CrewDayInput) =>
      request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/crew/no-show/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-crew-no-show:${input.requirementId}`,
              ),
            },
          },
          // `VENDOR`, always. See the note above. The reason code is the
          // published vocabulary rather than a slug typed here.
          body: {
            party: CUSTOMER_REPORTS_CREW_PARTY,
            reason_code: CREW_VENDOR_NO_SHOW_REASON,
          },
        }),
      ),
    // `report_crew_no_show` landed in `M2_INVALIDATION` at the Gate 3
    // integration and its scope is a **strict superset** of the two keys named
    // here before: `requirementScope` leads with `requirements.detail(id)`,
    // which is a prefix of both `rateCard.state(id)` and the requirement read,
    // and adds the list and the quote surfaces — all of which move when a
    // no-show returns the request to matching for a free re-dispatch. Verified
    // against the factory before deleting the hand-written pair, because a
    // re-point that quietly narrows an invalidation is worse than none.
    onSettled: (_data, _error, input) =>
      void invalidateForM2Command(queryClient, "report_crew_no_show", {
        requirementId: input.requirementId,
      }),
    retry: false,
  });
}


/**
 * The attempt behind a booking-fee checkout, read once so it can be handed on.
 *
 * `AccessCheckout` carries the provider and the order id but not the provider's public key,
 * and the key is what the widget opens with. The attempt read has it. Not a hook: this runs
 * inside the pay handler, between "the charge exists" and "the widget is open".
 */
export function fetchPaymentAttempt(attemptId: string) {
  return request(() =>
    getApiClient().GET("/api/v1/payment-attempts/{attempt_id}/", {
      params: { path: { attempt_id: attemptId } },
    }),
  );
}
