import type { Schemas } from "@vsolve/api-client";

/**
 * What a payment attempt currently means, and what the screen is allowed to say.
 *
 * ## The rule this file exists to enforce
 *
 * The provider's checkout widget calls back into the page when it thinks it has
 * finished. That callback is **not** the receipt. Truth arrives at Django as a
 * signed webhook, is reduced monotonically there, and reaches this client only
 * through `GET /payment-attempts/{id}/`. A page that renders "paid" from an SDK
 * callback is claiming a capture the server has not recorded, and it will do so
 * most confidently in exactly the cases where the two disagree — a dropped
 * webhook, a late capture, a customer who closed the widget on the bank's page.
 *
 * So every function here reads `attempt.status` and `attempt.reconciliation_state`
 * from the server projection, and there is nothing to pass in from the widget.
 *
 * ## Why `settled` and `resolved` are different questions
 *
 * `settled` asks "will polling ever learn anything new?". `resolved` asks "does
 * the customer know where their money is?". `AUTHORIZED` is settled — the
 * provider is done and no further webhook is guaranteed — while being emphatically
 * unresolved, because an authorization that never captures is money the customer
 * can see leaving their account against a booking that never happened. Collapsing
 * the two is how a screen stops polling and shows a green tick over a hold.
 */

export type PaymentAttempt = Schemas["PaymentAttempt"];
export type PaymentStatus = Schemas["PaymentAttemptStatusEnum"];
export type ReconciliationState = Schemas["ReconciliationStateEnum"];

/**
 * Statuses Django will not move off its own.
 *
 * `PROVIDER_PENDING` and `CREATED` are the live ones: the attempt exists and the
 * provider has not reported. Everything else is an outcome the provider has
 * already delivered.
 */
const SETTLED: readonly PaymentStatus[] = [
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "EXPIRED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
];

/** The only status that means the booking is paid for. */
const PAID: readonly PaymentStatus[] = ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"];

/** Outcomes where the customer's money definitively did not move. */
const NOT_CHARGED: readonly PaymentStatus[] = ["FAILED", "EXPIRED"];

export function isSettled(attempt: PaymentAttempt): boolean {
  // `NEEDS_ATTENTION` reopens a settled attempt. Django is telling us its own
  // view of this payment disagrees with the provider's, and it is working on it;
  // polling is exactly right until that resolves one way or the other.
  if (attempt.reconciliation_state === "NEEDS_ATTENTION") return false;
  return SETTLED.includes(attempt.status);
}

export function isPaid(attempt: PaymentAttempt): boolean {
  return PAID.includes(attempt.status);
}

export function isNotCharged(attempt: PaymentAttempt): boolean {
  return NOT_CHARGED.includes(attempt.status);
}

/**
 * The customer is owed an explanation and we do not have one yet.
 *
 * Two distinct situations, deliberately one state on screen because the customer
 * action is identical in both — wait, then ask us to check:
 *
 *   - `NEEDS_ATTENTION`: Django knows its record and the provider's disagree.
 *   - `AUTHORIZED`: the provider took a hold that has not become a capture.
 */
export function isAmbiguous(attempt: PaymentAttempt): boolean {
  return attempt.reconciliation_state === "NEEDS_ATTENTION" || attempt.status === "AUTHORIZED";
}

/**
 * Whether `POST /payment-attempts/{id}/reconcile/` is worth offering.
 *
 * Only for ambiguity. Reconciling a `CAPTURED` attempt asks the provider a
 * question already answered, and offering the button on a `FAILED` one invites
 * the customer to keep pressing it in the hope of a different result.
 */
export function canReconcile(attempt: PaymentAttempt): boolean {
  return isAmbiguous(attempt);
}

/**
 * A payment window that has closed, from the server's own clock.
 *
 * `serverNow` is required rather than defaulted to `Date.now()`. A device whose
 * clock is days out would otherwise decide on its own that a live payment had
 * expired, and hide the widget from a customer whose reservation is still held —
 * the same class of bug proposal 0010 fixed for offer countdowns.
 */
export function isExpired(attempt: PaymentAttempt, serverNow: Date): boolean {
  if (attempt.expires_at === null) return false;
  return new Date(attempt.expires_at).getTime() <= serverNow.getTime();
}

/**
 * Whether the provider handoff should still be offered.
 *
 * Requires a live status, an unexpired window and a provider that actually gave
 * us the two values its widget needs. A missing key or order id is not a
 * degraded case to paper over: it means the attempt is not ready, and opening a
 * widget without them fails inside the provider's own iframe where we cannot
 * explain it.
 */
export function canHandOff(attempt: PaymentAttempt, serverNow: Date): boolean {
  if (isSettled(attempt) || isExpired(attempt, serverNow)) return false;
  return Boolean(
    attempt.provider_public_key &&
      attempt.provider_order_id &&
      attempt.provider_order_id.trim() !== "",
  );
}

export type PaymentPhase =
  | "preparing"
  | "awaiting-customer"
  | "awaiting-provider"
  | "ambiguous"
  | "paid"
  | "not-charged"
  | "expired";

/**
 * The single phase a screen renders from.
 *
 * Ordered so the *least* certain answer wins, and then so the more certain of
 * the remainder does.
 *
 * `ambiguous` is tested first, ahead of `paid`. `NEEDS_ATTENTION` on a
 * `CAPTURED` attempt is Django saying its own record and the provider's do not
 * agree, and "Your booking is paid for — your payment is confirmed" is exactly
 * the claim it is telling us not to make. It is also the one phase that offers
 * `Check again`, so rendering `paid` over an unreconciled capture left the
 * customer with no way to ask us to look while the screen quietly kept polling.
 * `isSettled` already refuses to stop polling on `NEEDS_ATTENTION`; this makes
 * the copy agree with it.
 *
 * `paid` is then tested before `expired`: an attempt can capture moments before
 * its own window closes, and the customer whose money moved must never be shown
 * an expiry.
 */
export function paymentPhase(attempt: PaymentAttempt, serverNow: Date): PaymentPhase {
  if (isAmbiguous(attempt)) return "ambiguous";
  if (isPaid(attempt)) return "paid";
  if (isNotCharged(attempt)) return "not-charged";
  if (isExpired(attempt, serverNow)) return "expired";
  if (attempt.status === "PROVIDER_PENDING") return "preparing";
  return canHandOff(attempt, serverNow) ? "awaiting-customer" : "awaiting-provider";
}
