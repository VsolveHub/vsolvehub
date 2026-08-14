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
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2RateCardKeys.state(input.requirementId),
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
