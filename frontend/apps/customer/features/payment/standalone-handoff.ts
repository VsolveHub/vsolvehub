/**
 * Shared helpers for opening Razorpay (or simulating capture) after a
 * checkout-free payment attempt is created.
 *
 * Domain create endpoints often return only `payment_attempt_id`. Handoff needs
 * `provider`, `provider_public_key`, `provider_order_id`, and
 * `simulated_capture_available` from `GET /payment-attempts/{id}/`. The provider
 * order is stamped asynchronously via outbox, so callers poll briefly.
 */

import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

import { handoffTarget, openProviderCheckout, type HandoffTarget } from "./model/provider-handoff";

export type PaymentAttemptDetail = Schemas["PaymentAttempt"];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function fetchPaymentAttempt(attemptId: string): Promise<PaymentAttemptDetail> {
  return request(() =>
    getApiClient().GET("/api/v1/payment-attempts/{attempt_id}/", {
      params: { path: { attempt_id: attemptId } },
    }),
  );
}

export function simulatePaymentCapture(attemptId: string): Promise<PaymentAttemptDetail> {
  return request(() =>
    getApiClient().POST("/api/v1/payment-attempts/{attempt_id}/simulate-capture/", {
      params: { path: { attempt_id: attemptId } },
    }),
  );
}

const TERMINAL_HANDOFF_STATUSES = new Set([
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "EXPIRED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
]);

function isHandoffReady(attempt: PaymentAttemptDetail): boolean {
  if (attempt.simulated_capture_available) return true;
  return handoffTarget(attempt) !== null;
}

function isHandoffTerminal(attempt: PaymentAttemptDetail): boolean {
  return TERMINAL_HANDOFF_STATUSES.has(attempt.status);
}

/**
 * Poll until simulate-capture is available or Razorpay Checkout can open.
 * Stops early on terminal statuses (EXPIRED/FAILED/…) so callers do not wait
 * the full timeout when the outbox lost the race to expiry.
 * Returns the last read even on timeout so the caller can toast / navigate.
 */
export async function waitForPaymentHandoff(
  attemptId: string,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<PaymentAttemptDetail> {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const intervalMs = options?.intervalMs ?? 600;
  const started = Date.now();
  let attempt = await fetchPaymentAttempt(attemptId);
  while (
    !isHandoffReady(attempt) &&
    !isHandoffTerminal(attempt) &&
    Date.now() - started < timeoutMs
  ) {
    await sleep(intervalMs);
    attempt = await fetchPaymentAttempt(attemptId);
  }
  return attempt;
}

export async function completeOrOpenCheckout(
  attemptId: string,
  options: {
    businessName: string;
    onAwaitingCapture?: () => void;
  },
): Promise<{ mode: "simulated" | "checkout" | "pending"; attempt: PaymentAttemptDetail }> {
  const attempt = await waitForPaymentHandoff(attemptId);

  if (attempt.simulated_capture_available) {
    await simulatePaymentCapture(attemptId);
    return { mode: "simulated", attempt };
  }

  const target: HandoffTarget | null = handoffTarget(attempt);
  if (target === null) {
    return { mode: "pending", attempt };
  }

  options.onAwaitingCapture?.();
  await openProviderCheckout(target, { businessName: options.businessName });
  return { mode: "checkout", attempt };
}
