import { request, type Schemas } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import * as WebBrowser from "expo-web-browser";

export type PaymentAttempt = Schemas["PaymentAttempt"] & {
  checkout_url?: string;
};

export type PaymentHandoffResult = {
  mode: "checkout" | "pending";
  attempt: PaymentAttempt;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function fetchPaymentAttempt(attemptId: string): Promise<PaymentAttempt> {
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

/**
 * Polls until Razorpay Checkout can open, matching web's waitForPaymentHandoff.
 */
export async function waitForPaymentHandoff(
  attemptId: string,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<PaymentAttempt> {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const intervalMs = options?.intervalMs ?? 600;
  const started = Date.now();
  let attempt = await fetchPaymentAttempt(attemptId);

  while (
    !attempt.provider_order_id &&
    !TERMINAL_STATUSES.has(attempt.status) &&
    Date.now() - started < timeoutMs
  ) {
    await sleep(intervalMs);
    attempt = await fetchPaymentAttempt(attemptId);
  }
  return attempt;
}

/**
 * Opens Razorpay Checkout for the payment attempt, matching web completeOrOpenCheckout.
 */
export async function completeOrOpenRentalCheckout(
  attemptId: string,
  options?: {
    businessName?: string;
    onAwaitingCapture?: () => void;
  },
): Promise<PaymentHandoffResult> {
  const attempt = await waitForPaymentHandoff(attemptId);

  // If Razorpay checkout order is stamped, open checkout URL or redirect
  if (attempt.checkout_url) {
    options?.onAwaitingCapture?.();
    await WebBrowser.openBrowserAsync(attempt.checkout_url);
    return { mode: "checkout", attempt };
  }

  return { mode: "pending", attempt };
}
