import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { group, money, unit, unitLine } from "@/features/bookings/fixtures";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
const router = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

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
    wallet_reserved_paise: 0,
    coins_burned: 0,
    coin_discount_paise: 0,
    razorpay_amount_paise: 250000,
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
  router.replace.mockReset();
  router.push.mockReset();
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
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/bookings/group-1"));
  });

  it("names amount lines from the booking, not visit positions", async () => {
    const payableGroup = group({
      status: "PAYMENT_PENDING",
      recovery_action: "PAYMENT_REQUIRED",
      checkout_id: "checkout-1",
      checkout_version: 7,
      units: [
        unit({
          status: "PAYMENT_PENDING",
          lines: [
            unitLine({
              id: "line-service",
              position: 1,
              kind: "SERVICE",
              label: "Decorative Light Installation",
              amount: money(49900),
            }),
            unitLine({
              id: "line-minimum",
              position: 2,
              kind: "MINIMUM_VISIT_ADJUSTMENT",
              code: "minimum_visit_topup",
              label: "Minimum visit charge top-up",
              amount: money(0),
            }),
            unitLine({
              id: "line-fee",
              position: 3,
              kind: "PLATFORM_FEE_ALLOCATION",
              code: "platform_fee_allocation",
              label: "Allocated platform fee",
              amount: money(2900),
            }),
          ],
          total: money(52800),
        }),
      ],
    });
    const created = paymentAttempt({
      status: "CREATED",
      amount: money(52800),
      allocations: [
        {
          id: "alloc-service",
          fulfilment_unit_id: "fu-1",
          fulfilment_line_id: "line-service",
          position: 1,
          amount: money(49900),
          refunded: money(0),
        },
        {
          id: "alloc-minimum",
          fulfilment_unit_id: "fu-1",
          fulfilment_line_id: "line-minimum",
          position: 2,
          amount: money(0),
          refunded: money(0),
        },
        {
          id: "alloc-fee",
          fulfilment_unit_id: "fu-1",
          fulfilment_line_id: "line-fee",
          position: 3,
          amount: money(2900),
          refunded: money(0),
        },
      ],
    });

    client.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") return Promise.resolve(ok(payableGroup));
      if (path === "/api/v1/checkouts/{checkout_id}/payment/") return Promise.resolve(ok(created));
      return Promise.resolve(notFound());
    });

    render(<PaymentWorkspace groupId="group-1" />, { wrapper });

    expect(await screen.findByText("Pay for your booking")).toBeInTheDocument();
    expect(screen.getByText("Service")).toBeInTheDocument();
    expect(screen.getByText("Tax")).toBeInTheDocument();
    expect(screen.getByText("Platform fee")).toBeInTheDocument();
    expect(screen.queryByText("Visit 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Visit 3")).not.toBeInTheDocument();
    expect(screen.queryByText("Visit 4")).not.toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("returns to the booking page once payment is captured", async () => {
    const payableGroup = group({
      status: "PAYMENT_PENDING",
      recovery_action: "PAYMENT_REQUIRED",
      checkout_id: "checkout-1",
      checkout_version: 7,
      units: [unit({ status: "PAYMENT_PENDING" })],
    });
    const captured = paymentAttempt({
      status: "CAPTURED",
      reconciliation_state: "IN_SYNC",
      simulated_capture_available: false,
    });

    client.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") return Promise.resolve(ok(payableGroup));
      if (path === "/api/v1/checkouts/{checkout_id}/payment/") return Promise.resolve(ok(captured));
      return Promise.resolve(notFound());
    });

    render(<PaymentWorkspace groupId="group-1" />, { wrapper });

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/bookings/group-1"));
    expect(screen.queryByText("Your booking is paid for")).not.toBeInTheDocument();
    expect(screen.queryByText("Pay for your booking")).not.toBeInTheDocument();
  });
});
