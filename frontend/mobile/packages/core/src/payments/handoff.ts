// Ported from frontend/apps/customer/features/payment/{model/provider-handoff,standalone-handoff}.ts
import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "../api/client";

export type PaymentAttemptDetail = Schemas["PaymentAttempt"];

/** Everything the Razorpay screen needs, or `null` when the attempt cannot be handed off yet. */
export interface HandoffTarget {
  publicKey: string;
  providerOrderId: string;
  amountPaise: number;
  currency: string;
}

/** Razorpay is the only provider with a checkout screen. */
export function handoffTarget(attempt: PaymentAttemptDetail): HandoffTarget | null {
  if (attempt.provider !== "razorpay") return null;
  if (attempt.provider_public_key === null || attempt.provider_order_id === "") return null;
  return {
    publicKey: attempt.provider_public_key,
    providerOrderId: attempt.provider_order_id,
    // Display only: Razorpay charges what its own order says, and this is Django's number.
    amountPaise: attempt.amount.amount_paise,
    currency: attempt.amount.currency,
  };
}

export function fetchPaymentAttempt(attemptId: string): Promise<PaymentAttemptDetail> {
  return request(() =>
    getApiClient().GET("/api/v1/payment-attempts/{attempt_id}/", {
      params: { path: { attempt_id: attemptId } },
    }),
  );
}

const TERMINAL_STATUSES = new Set([
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "EXPIRED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll until Razorpay can open. The provider order is stamped asynchronously after the charge
 * is created, so a create endpoint usually answers before it is ready. Stops early on a
 * terminal status, and returns the last read even on timeout so the caller can say so.
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
    handoffTarget(attempt) === null &&
    !TERMINAL_STATUSES.has(attempt.status) &&
    Date.now() - started < timeoutMs
  ) {
    await sleep(intervalMs);
    attempt = await fetchPaymentAttempt(attemptId);
  }
  return attempt;
}
