/**
 * Partner helpers for Razorpay handoff after vendor-subscription (and similar)
 * payment attempts are created.
 */

import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

import { handoffTarget, openProviderCheckout } from "./provider-handoff";

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

function isHandoffReady(attempt: PaymentAttemptDetail): boolean {
  if (attempt.simulated_capture_available) return true;
  return (
    handoffTarget({
      id: attempt.id,
      provider: attempt.provider,
      provider_public_key: attempt.provider_public_key,
      provider_order_id: attempt.provider_order_id,
      amount_paise: attempt.razorpay_amount_paise ?? attempt.amount.amount_paise,
      simulated_capture_available: attempt.simulated_capture_available,
    }) !== null
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
    !TERMINAL_HANDOFF_STATUSES.has(attempt.status) &&
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

  const target = handoffTarget({
    id: attempt.id,
    provider: attempt.provider,
    provider_public_key: attempt.provider_public_key,
    provider_order_id: attempt.provider_order_id,
    amount_paise: attempt.razorpay_amount_paise ?? attempt.amount.amount_paise,
    simulated_capture_available: attempt.simulated_capture_available,
  });

  if (target === null) {
    return { mode: "pending", attempt };
  }

  options.onAwaitingCapture?.();
  await openProviderCheckout(target, { businessName: options.businessName });
  return { mode: "checkout", attempt };
}
