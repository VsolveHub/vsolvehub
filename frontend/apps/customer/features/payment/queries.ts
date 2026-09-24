"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiRequestError,
  getStableIdempotencyKey,
  request,
  serverClock,
  type Schemas,
} from "@vsolve/api-client";
import { EXPIRING_STATE, STATIC_CONTENT, boundedPoll, queryKeys } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

import { isSettled, type PaymentAttempt } from "./model/outcome";

/**
 * The Customer's money surface (contract 1.10.0 commands, reachable from a
 * Booking Group since 1.14.0).
 *
 * ## Why this exists as its own feature
 *
 * Payment is not a step of the booking workspace. The workspace is a wizard the
 * customer walks once; a payment is a record that outlives it, gets resumed from
 * a different device, and has to be answerable long after the tab that started it
 * is gone. Keeping it here means the resume path is a route, not a piece of
 * component state someone has to reconstruct.
 *
 * ## What this layer will not do
 *
 * It computes no amount. Every rupee on screen comes from `attempt.amount` or an
 * allocation Django wrote; there is no summing, no fee derivation and no tax
 * arithmetic anywhere in this app. The moment a client can produce a number that
 * disagrees with an invoice, it eventually will.
 *
 * It also never treats the provider widget's callback as an outcome. See
 * `model/outcome.ts` — the webhook is truth and this client only reads it.
 */

export type { PaymentAttempt } from "./model/outcome";
export type Order = Schemas["Order"];
export type PaymentAllocation = Schemas["PaymentAllocation"];
export type TaxDocument = Schemas["TaxDocument"];

/**
 * The stable key for paying one checkout at one version.
 *
 * The version belongs in the key for the same reason it belongs in the request:
 * re-pressing Pay against the checkout the customer is looking at is the same
 * command and must replay to the same attempt, while paying after the checkout
 * has moved is a different command against a different world. Sharing a key
 * across the two would make Django answer `idempotency_key_reused` instead of
 * doing the work.
 *
 * `getStableIdempotencyKey` persists this in `sessionStorage`, which is what
 * makes a lost provider redirect resume the original attempt rather than open a
 * second one against the same reservation.
 */
export function paymentIntentKey(input: {
  checkoutId: string;
  expectedCheckoutVersion: number;
  walletAmountPaise?: number;
  coinBurnAmount?: number;
}): string {
  return getStableIdempotencyKey(
    `payment-attempt:${input.checkoutId}:${input.expectedCheckoutVersion}:${input.walletAmountPaise ?? 0}:${input.coinBurnAmount ?? 0}`,
  );
}

export interface StartPaymentInput {
  checkoutId: string;
  expectedCheckoutVersion: number;
  /** Only so the created attempt can seed the group's cache entry. */
  groupId: string;
  walletAmountPaise?: number;
  coinBurnAmount?: number;
}

/**
 * Starts — or resumes — the payment attempt for a checkout.
 *
 * `202`, not `201`: Django has accepted the attempt and created the provider
 * order, but nothing has been captured. The screen must not read this response as
 * a payment.
 *
 * No auto-retry. A `409` here means the checkout moved while the customer was
 * looking at it, and re-sending would pay against a state they never saw.
 */
export function useStartPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartPaymentInput) =>
      request(() =>
        getApiClient().POST("/api/v1/payment-attempts/", {
          params: { header: { "Idempotency-Key": paymentIntentKey(input) } },
          body: {
            checkout_id: input.checkoutId,
            expected_checkout_version: input.expectedCheckoutVersion,
            wallet_amount_paise: input.walletAmountPaise ?? 0,
            coin_burn_amount: input.coinBurnAmount ?? 0,
          },
        }),
      ),
    onSuccess: (attempt) => {
      // Authoritative: seed both the attempt's own entry and the checkout lookup
      // the recovery path reads, so a return from the provider finds it warm.
      queryClient.setQueryData(queryKeys.payment.attempt(attempt.id), attempt);
      queryClient.setQueryData(queryKeys.payment.forCheckout(attempt.checkout_id), attempt);
    },
    onError: (error) => {
      // The checkout moved underneath the customer. Re-read the group so the
      // next decision is made against what is actually there.
      if (error instanceof ApiRequestError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.booking.groups() });
      }
    },
    retry: false,
  });
}

/**
 * One payment attempt, observed until the provider outcome settles.
 *
 * This is the only thing on the payment screen entitled to say what happened.
 * `isSettled` keeps the poll running through `NEEDS_ATTENTION`, so an attempt
 * Django is actively reconciling does not freeze on a stale answer.
 */
export function usePaymentAttempt(attemptId: string | null) {
  return useQuery({
    queryKey: queryKeys.payment.attempt(attemptId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/payment-attempts/{attempt_id}/", {
          params: { path: { attempt_id: attemptId! } },
        }),
      ),
    enabled: attemptId !== null,
    ...EXPIRING_STATE,
    ...boundedPoll<PaymentAttempt>({ isSettled }),
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && (error.status === 404 || error.status === 403)
        ? false
        : failureCount < 2,
  });
}

/**
 * The latest attempt for a checkout — the recovery read.
 *
 * The redirect-loss path. A customer who came back on a different device, or
 * whose tab was killed while the provider widget was open, holds a checkout id
 * and nothing else. Without this they would either see no payment at all and
 * start a second one, or be told to wait for an attempt this client cannot name.
 *
 * `404` is a real answer here and not an error to retry: it means no attempt was
 * ever created, so the customer should start one.
 */
export function useCheckoutPayment(checkoutId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.payment.forCheckout(checkoutId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/checkouts/{checkout_id}/payment/", {
          params: { path: { checkout_id: checkoutId! } },
        }),
      ),
    enabled: checkoutId !== null && enabled,
    ...EXPIRING_STATE,
    ...boundedPoll<PaymentAttempt>({ isSettled }),
    retry: false,
  });
}

/** `404` from the checkout lookup: nothing was ever started, not a failure. */
export function isNoAttemptStarted(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

/**
 * Asks Django to re-read this attempt from the provider.
 *
 * Offered only for genuine ambiguity (`model/outcome.ts` decides). Idempotent
 * and stable-keyed per attempt, so a customer pressing it twice gets one
 * reconciliation rather than two provider calls.
 *
 * `503` is its own outcome, not a retry signal: the provider is unreachable, and
 * hammering it from the browser makes the ambiguity last longer. The screen says
 * so and offers the button again later.
 */
export function useReconcilePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (attemptId: string) =>
      request(() =>
        getApiClient().POST("/api/v1/payment-attempts/{attempt_id}/reconcile/", {
          params: {
            path: { attempt_id: attemptId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(`payment-reconcile:${attemptId}`),
            },
          },
        }),
      ),
    onSuccess: (attempt) => {
      queryClient.setQueryData(queryKeys.payment.attempt(attempt.id), attempt);
      queryClient.setQueryData(queryKeys.payment.forCheckout(attempt.checkout_id), attempt);
      // A resolved payment can move the group to BOOKED.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.booking.group(attempt.booking_group_id),
      });
    },
    retry: false,
  });
}

/** `503` on reconcile: the provider could not be reached, not a payment failure. */
export function isProviderUnreachable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 503;
}

/**
 * The paid Order: per-unit allocations, bookings and tax documents.
 *
 * `STATIC_CONTENT` freshness. An order is immutable once written — refunds are
 * separate records that point at it — so re-reading it on a timer would be asking
 * the same question forever.
 */
export function useOrder(orderId: string | null) {
  return useQuery({
    queryKey: queryKeys.payment.order(orderId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/orders/{order_id}/", {
          params: { path: { order_id: orderId! } },
        }),
      ),
    enabled: orderId !== null,
    ...STATIC_CONTENT,
    retry: false,
  });
}

/** One immutable invoice or credit note. */
export function useTaxDocument(documentId: string | null) {
  return useQuery({
    queryKey: queryKeys.payment.taxDocument(documentId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/tax-documents/{document_id}/", {
          params: { path: { document_id: documentId! } },
        }),
      ),
    enabled: documentId !== null,
    ...STATIC_CONTENT,
    retry: false,
  });
}

/**
 * The server's current instant, for every deadline decision on these screens.
 *
 * Never `new Date()`. A device whose clock is wrong would otherwise decide on its
 * own that a live payment window had closed and hide the widget from a customer
 * whose reservation Django is still holding.
 */
export function serverNow(): Date {
  return new Date(serverClock.now());
}

/**
 * Marks this payment captured with no gateway involved. Development only.
 *
 * Django publishes this endpoint only when `PAYMENTS_ALLOW_SIMULATED_CAPTURE` is
 * on, refuses to boot with it on in production, and additionally requires the
 * attempt's own provider to be `fake`. A `404` therefore means "this environment
 * does not do that" rather than a failure, which is why the control below hides
 * itself on one.
 *
 * It runs the real capture path server-side, so the poll that follows sees the
 * same states a genuine provider webhook would produce. Nothing here shortcuts
 * the outcome — `usePaymentAttempt` is still the only thing entitled to say what
 * happened.
 */
export function useSimulateCapture() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (attemptId: string) =>
      request(() =>
        getApiClient().POST("/api/v1/payment-attempts/{attempt_id}/simulate-capture/", {
          params: { path: { attempt_id: attemptId } },
        }),
      ),
    onSuccess: (attempt) => {
      queryClient.setQueryData(queryKeys.payment.attempt(attempt.id), attempt);
      queryClient.setQueryData(queryKeys.payment.forCheckout(attempt.checkout_id), attempt);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.booking.group(attempt.booking_group_id),
      });
      // Capture clears the booked items, so the cart the customer returns to has
      // moved on.
      void queryClient.invalidateQueries({ queryKey: queryKeys.booking.cart() });
    },
    retry: false,
  });
}

/** `404` from simulated capture: this environment does not offer it. */
export function isSimulatedCaptureUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}
