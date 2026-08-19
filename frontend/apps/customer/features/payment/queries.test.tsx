import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { queryKeys } from "@vsolve/query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The payment command layer.
 *
 * Four properties, each of which fails silently and each of which costs real
 * money when it does: the key must be stable per checkout version, the created
 * attempt must land in the cache the recovery path reads, a version conflict
 * must send the customer back to server truth, and nothing may auto-retry.
 */

const client = {
  GET: vi.fn(),
  POST: vi.fn(),
  PATCH: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
};

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const {
  paymentIntentKey,
  useCheckoutPayment,
  useReconcilePayment,
  useSimulateCapture,
  useStartPayment,
} = await import("./queries");

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

const ATTEMPT = {
  id: "attempt-1",
  checkout_id: "checkout-1",
  booking_group_id: "group-1",
  quote_id: "quote-1",
  purpose: "BOOKING_GROUP",
  provider: "razorpay",
  provider_public_key: "rzp_test_key",
  provider_order_id: "order_abc",
  status: "CREATED",
  reconciliation_state: "PENDING",
  failure_code: "",
  version: 1,
  amount: { amount_paise: 250000, currency: "INR" },
  expires_at: null,
  allocations: [],
  simulated_capture_available: false,
  created_at: "2026-08-04T11:55:00.000Z",
  updated_at: "2026-08-04T11:55:00.000Z",
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  sessionStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
});

describe("paymentIntentKey", () => {
  it("is stable for one checkout at one version", () => {
    const input = { checkoutId: "checkout-1", expectedCheckoutVersion: 3 };

    // The redirect-loss property: the same logical payment must produce the same
    // key across a reload so Django replays the attempt instead of opening a
    // second one against the same held reservation.
    expect(paymentIntentKey(input)).toBe(paymentIntentKey(input));
  });

  it("mints a new key once the checkout has moved", () => {
    const first = paymentIntentKey({ checkoutId: "checkout-1", expectedCheckoutVersion: 3 });
    const second = paymentIntentKey({ checkoutId: "checkout-1", expectedCheckoutVersion: 4 });

    // Paying against a version the customer never saw is a different command.
    // Reusing the key here would make Django answer `idempotency_key_reused`
    // rather than doing the work.
    expect(second).not.toBe(first);
  });

  it("never shares a key between two checkouts", () => {
    expect(paymentIntentKey({ checkoutId: "a", expectedCheckoutVersion: 1 })).not.toBe(
      paymentIntentKey({ checkoutId: "b", expectedCheckoutVersion: 1 }),
    );
  });
});

describe("useStartPayment", () => {
  it("sends the version and a stable key, and seeds both cache entries", async () => {
    client.POST.mockResolvedValue(ok(ATTEMPT, 202));

    const { result } = renderHook(() => useStartPayment(), { wrapper });
    result.current.mutate({
      checkoutId: "checkout-1",
      expectedCheckoutVersion: 3,
      groupId: "group-1",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, options] = client.POST.mock.calls[0];
    expect(path).toBe("/api/v1/payment-attempts/");
    expect(options.body).toEqual({ checkout_id: "checkout-1", expected_checkout_version: 3 });
    expect(options.params.header["Idempotency-Key"]).toBe(
      paymentIntentKey({ checkoutId: "checkout-1", expectedCheckoutVersion: 3 }),
    );

    // Seeding `forCheckout` is what lets a return from the provider find the
    // attempt without a round trip — and what stops a second attempt being
    // started because the client could not see the first.
    expect(queryClient.getQueryData(queryKeys.payment.attempt("attempt-1"))).toEqual(ATTEMPT);
    expect(queryClient.getQueryData(queryKeys.payment.forCheckout("checkout-1"))).toEqual(ATTEMPT);
  });

  it("does not retry a failed payment command", async () => {
    client.POST.mockResolvedValue({
      data: undefined,
      error: { code: "checkout_version_conflict", message: "stale" },
      response: new Response(null, { status: 409 }),
    });

    const { result } = renderHook(() => useStartPayment(), { wrapper });
    result.current.mutate({
      checkoutId: "checkout-1",
      expectedCheckoutVersion: 1,
      groupId: "group-1",
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // One call, not two. A retried payment against a moved checkout is a payment
    // the customer never agreed to.
    expect(client.POST).toHaveBeenCalledTimes(1);
  });
});

describe("useCheckoutPayment", () => {
  it("reads the latest attempt for a checkout", async () => {
    client.GET.mockResolvedValue(ok(ATTEMPT));

    const { result } = renderHook(() => useCheckoutPayment("checkout-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.GET.mock.calls[0][0]).toBe("/api/v1/checkouts/{checkout_id}/payment/");
    expect(result.current.data).toEqual(ATTEMPT);
  });

  it("asks for nothing when there is no checkout to ask about", () => {
    renderHook(() => useCheckoutPayment(null), { wrapper });
    expect(client.GET).not.toHaveBeenCalled();
  });
});

describe("useReconcilePayment", () => {
  it("writes back server truth and re-reads the group", async () => {
    const captured = { ...ATTEMPT, status: "CAPTURED", reconciliation_state: "IN_SYNC" };
    client.POST.mockResolvedValue(ok(captured));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useReconcilePayment(), { wrapper });
    result.current.mutate("attempt-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(queryKeys.payment.attempt("attempt-1"))).toEqual(captured);
    // A resolved payment can move the group to BOOKED, so the group is stale.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.booking.group("group-1") });
  });
});

describe("useSimulateCapture", () => {
  it("marks a fake-provider payment captured through Django and refreshes booking state", async () => {
    const captured = {
      ...ATTEMPT,
      provider: "fake",
      provider_public_key: null,
      status: "CAPTURED",
      reconciliation_state: "IN_SYNC",
      simulated_capture_available: true,
    };
    client.POST.mockResolvedValue(ok(captured));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSimulateCapture(), { wrapper });
    result.current.mutate("attempt-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, options] = client.POST.mock.calls[0];
    expect(path).toBe("/api/v1/payment-attempts/{attempt_id}/simulate-capture/");
    expect(options.params.path).toEqual({ attempt_id: "attempt-1" });
    expect(queryClient.getQueryData(queryKeys.payment.attempt("attempt-1"))).toEqual(captured);
    expect(queryClient.getQueryData(queryKeys.payment.forCheckout("checkout-1"))).toEqual(
      captured,
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.booking.group("group-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.booking.cart() });
  });
});
