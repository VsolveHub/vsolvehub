"use client";

import {
  ApiRequestError,
  getStableIdempotencyKey,
  request,
  type Schemas,
} from "@vsolve/api-client";
import { useRequestOtp } from "@vsolve/query";
import { useMutation } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Refunds: step up, issue one, reconcile one with the provider.
 *
 * ## There is nothing to read, and the console must not pretend otherwise
 *
 * The contract publishes **no staff read at all**. `GET /refunds/{id}/` exists
 * but `RefundDetailView` filters `order__customer=user`, so an operator
 * gets a 404 for every refund they did not personally buy — it is a Customer
 * endpoint that happens to live near this one. `POST /finance/refunds/` is a
 * create with no list beside it.
 *
 * So there is no queue, no lookup and no cache. Everything this console can show
 * about a refund comes from the response to the command that just ran, and the
 * screen says so rather than presenting an empty table as "no refunds pending".
 * Closing that gap is a backend change, not a client one.
 *
 * ## Step-up is a session fact, not a client flag
 *
 * `HasRecentOperationsStepUp` checks Django's `UserSession.stepped_up_at` against
 * `OPERATIONS_STEP_UP_TTL_SECONDS` on every money-moving request. The TTL is **not
 * published in the contract**, so this module deliberately computes no countdown
 * and stores no "we are stepped up" boolean to gate its own buttons: both would
 * be a client-side copy of an authorization decision, and the copy would be
 * wrong precisely when it mattered — a stale `true` sends a refund the server
 * refuses, a stale `false` blocks one it would have allowed.
 *
 * Django is asked instead. `stepped_up_at` is shown as the fact it is, the
 * commands are always offered, and a `403` is read as "your confirmation has
 * lapsed — confirm again".
 */

export type Refund = Schemas["Refund"];
export type StepUpSession = Schemas["StepUpSession"];

/* -------------------------------------------------------------------------
   Step-up
   ------------------------------------------------------------------------- */

/**
 * Sends the operator a code, for confirming their own session.
 *
 * The same OTP request the login flow uses — Django issues one kind of
 * challenge, and `FinanceStepUpView` verifies it against the *signed-in* user,
 * refusing if the verified number is not theirs. A separate request path here
 * would be a second implementation of the rate limit.
 *
 * The endpoint keeps its `finance` path segment because that is what the
 * contract publishes. It is role-agnostic underneath: `mark_session_step_up`
 * only stamps `UserSession.stepped_up_at`, which is the field
 * `HasRecentOperationsStepUp` reads.
 */
export function useRequestStepUpCode() {
  return useRequestOtp(getApiClient());
}

export interface StepUpInput {
  challengeId: string;
  phoneNumber: string;
  code: string;
}

export function useConfirmStepUp() {
  return useMutation({
    mutationFn: (input: StepUpInput): Promise<StepUpSession> =>
      request(() =>
        getApiClient().POST("/api/v1/auth/finance/step-up/", {
          body: {
            challenge_id: input.challengeId,
            phone_number: input.phoneNumber,
            code: input.code,
          },
        }),
      ),
    // Never retried. The code is single-use, and a retry spends it against a
    // challenge that has already been consumed.
    retry: false,
  });
}

/** The step-up did not match this session, or the code was wrong. */
export function isStepUpRejected(error: unknown): boolean {
  return (
    error instanceof ApiRequestError && (error.status === 400 || error.status === 403)
  );
}

/* -------------------------------------------------------------------------
   Refunds
   ------------------------------------------------------------------------- */

export interface RefundInput {
  orderId: string;
  /** The visits being refunded. Django caps this at 20. */
  fulfilmentUnitIds: string[];
  /** A slug Operations already uses, e.g. `service-not-delivered`. */
  reasonCode: string;
}

/**
 * One stable key per Order, set of visits and reason.
 *
 * A double-click on a refund is the most expensive duplicate in the product, and
 * `request_unit_refund` also short-circuits on the key itself — it returns the
 * existing refund rather than creating a second one. The key is derived from the
 * whole request because that is what "this refund" means: a different set of
 * visits is a different refund, not a retry of this one.
 *
 * The unit ids are sorted, so the same refund chosen in a different order is
 * still the same refund.
 */
export function refundIntentKey(input: RefundInput): string {
  const units = [...input.fulfilmentUnitIds].map((id) => id.trim()).sort().join(",");
  return getStableIdempotencyKey(
    `finance-refund:${input.orderId.trim()}:${units}:${input.reasonCode.trim()}`,
  );
}

export function useRequestRefund() {
  return useMutation({
    mutationFn: (input: RefundInput): Promise<Refund> =>
      request(() =>
        getApiClient().POST("/api/v1/finance/refunds/", {
          params: { header: { "Idempotency-Key": refundIntentKey(input) } },
          body: {
            order_id: input.orderId.trim(),
            fulfilment_unit_ids: input.fulfilmentUnitIds.map((id) => id.trim()),
            reason_code: input.reasonCode.trim(),
          },
        }),
      ),
    // Never retried automatically. A retry is safe on the server under the same
    // key, but an automatic one hides from the operator that the first attempt's
    // outcome was never seen — and this is money leaving the business.
    retry: false,
  });
}

/**
 * Asks the provider what actually happened to a refund, and records the answer.
 *
 * Not a read, despite reading like one: `reconcile_refund` submits an unsubmitted
 * refund, and on a provider failure it moves the refund to `UNDER_REVIEW`,
 * flags reconciliation as `NEEDS_ATTENTION` and opens a financial exception. It
 * is a command, it is audited, and it is behind the same step-up.
 *
 * A `503` is its own outcome rather than a failure: the refund is unchanged and
 * the right thing is to try later, not to issue another refund.
 */
export function useReconcileRefund() {
  return useMutation({
    mutationFn: (refundId: string): Promise<Refund> =>
      request(() =>
        getApiClient().POST("/api/v1/finance/refunds/{refund_id}/reconcile/", {
          params: {
            path: { refund_id: refundId.trim() },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `finance-reconcile:${refundId.trim()}`,
              ),
            },
          },
        }),
      ),
    retry: false,
  });
}

/* -------------------------------------------------------------------------
   Reading Django's refusals
   ------------------------------------------------------------------------- */

/**
 * The step-up has lapsed, or this session is not acting as Operations.
 *
 * Django answers `403` from `HasRecentOperationsStepUp` for both, and it does not
 * say which. That is fine to surface honestly — "confirm who you are again" is
 * the recovery for the common case and harmless in the other, where the shell
 * has already refused the whole console.
 */
export function isStepUpRequired(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 403;
}

/** The provider could not be reached; the refund is unchanged. */
export function isProviderUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 503;
}

/** Nothing refundable, a legacy Order, or units that are not the Order's. */
export function isRefundRefused(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 409;
}

export function isInProgress(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "idempotency_in_progress";
}

export function isKeyReused(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "idempotency_key_reused";
}
