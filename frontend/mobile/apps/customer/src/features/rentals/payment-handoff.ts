import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import * as WebBrowser from "expo-web-browser";

export type PaymentHandoffResult = {
  mode: "simulated" | "checkout" | "pending";
  attempt: any;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function fetchPaymentAttempt(attemptId: string): Promise<any> {
  return request(() =>
    (getApiClient() as any).GET("/api/v1/payment-attempts/{attempt_id}/", {
      params: { path: { attempt_id: attemptId } },
    }),
  );
}

export function simulatePaymentCapture(attemptId: string): Promise<any> {
  return request(() =>
    (getApiClient() as any).POST("/api/v1/payment-attempts/{attempt_id}/simulate-capture/", {
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
 * Polls until simulate capture or checkout is available, matching web's waitForPaymentHandoff.
 */
export async function waitForPaymentHandoff(
  attemptId: string,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<any> {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const intervalMs = options?.intervalMs ?? 600;
  const started = Date.now();
  let attempt = await fetchPaymentAttempt(attemptId);

  while (
    !attempt.simulated_capture_available &&
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
 * Completes payment attempt via simulated capture or provider handoff, matching web completeOrOpenCheckout.
 */
export async function completeOrOpenRentalCheckout(
  attemptId: string,
  options?: {
    businessName?: string;
    onAwaitingCapture?: () => void;
  },
): Promise<PaymentHandoffResult> {
  const attempt = await waitForPaymentHandoff(attemptId);

  if (attempt.simulated_capture_available) {
    await simulatePaymentCapture(attemptId);
    return { mode: "simulated", attempt };
  }

  // If Razorpay checkout order is stamped, open checkout URL or redirect
  if (attempt.checkout_url) {
    options?.onAwaitingCapture?.();
    await WebBrowser.openBrowserAsync(attempt.checkout_url);
    return { mode: "checkout", attempt };
  }

  return { mode: "pending", attempt };
}
