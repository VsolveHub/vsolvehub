import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { group, money, unit } from "@/features/bookings/fixtures";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { PaymentWorkspace } = await import("./payment-workspace");

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function notFound() {
  return {
    data: undefined,
    error: {
      error: {
        code: "not_found",
        message: "No payment attempt exists for this checkout.",
        details: null,
        retryable: false,
        request_id: "req_1",
      },
    },
    response: new Response(null, { status: 404 }),
  };
}

function paymentAttempt(
  overrides: Partial<Schemas["PaymentAttempt"]> = {},
): Schemas["PaymentAttempt"] {
  return {
    id: "attempt-1",
    checkout_id: "checkout-1",
    booking_group_id: "group-1",
    quote_id: "quote-1",
    purpose: "BOOKING_GROUP",
    provider: "fake",
    provider_public_key: null,
    provider_order_id: "fake_order_attempt_1",
    status: "CREATED",
    reconciliation_state: "PENDING",
    failure_code: "",
    version: 1,
    amount: money(250000),
    expires_at: null,
    allocations: [],
    simulated_capture_available: true,
    created_at: "2026-08-04T11:55:00.000Z",
    updated_at: "2026-08-04T11:55:00.000Z",
    ...overrides,
  };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  window.sessionStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("PaymentWorkspace development payment", () => {
  it("starts a fake payment and marks it paid from the primary button click", async () => {
    const payableGroup = group({
      status: "PAYMENT_PENDING",
      recovery_action: "PAYMENT_REQUIRED",
      checkout_id: "checkout-1",
      checkout_version: 7,
      units: [unit({ status: "PAYMENT_PENDING" })],
    });
    const created = paymentAttempt();
    const captured = paymentAttempt({
      status: "CAPTURED",
      reconciliation_state: "IN_SYNC",
      simulated_capture_available: false,
    });

    client.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") return Promise.resolve(ok(payableGroup));
      if (path === "/api/v1/checkouts/{checkout_id}/payment/") return Promise.resolve(notFound());
      return Promise.resolve(notFound());
    });
    client.POST.mockImplementation((path: string) => {
      if (path === "/api/v1/payment-attempts/") return Promise.resolve(ok(created, 202));
      if (path === "/api/v1/payment-attempts/{attempt_id}/simulate-capture/") {
        return Promise.resolve(ok(captured));
      }
      return Promise.resolve(notFound());
    });

    render(<PaymentWorkspace groupId="group-1" />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Continue to payment" }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/payment-attempts/{attempt_id}/simulate-capture/",
        { params: { path: { attempt_id: "attempt-1" } } },
      ),
    );
    expect(client.POST).toHaveBeenCalledWith(
      "/api/v1/payment-attempts/",
      expect.objectContaining({
        body: { checkout_id: "checkout-1", expected_checkout_version: 7 },
      }),
    );
  });
});
