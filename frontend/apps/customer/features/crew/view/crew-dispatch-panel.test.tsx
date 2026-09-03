import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const { CrewDispatchPanel } = await import("./crew-dispatch-panel");

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function booking(): Schemas["RateCardBooking"] {
  return {
    id: "booking-1",
    status: "OFFER_HELD",
    headcount: 3,
    days: 1,
    day_rate_paise: 90_000,
    total_customer_paise: 270_000,
    lead_receipt_paise: 255_000,
    lead_day_receipt_paise: 255_000,
    booking_fee_paise: 15_000,
    standard_day_hours: 8,
    overtime_hourly_paise: 15_000,
    add_on_rates: {},
    inclusions: [],
    wave: 1,
    hold_expires_at: "2099-01-01T00:00:00.000Z",
    fallback_reason_code: "",
    fell_back_at: null,
    confirmed_at: null,
    created_at: "2026-09-02T06:00:00.000Z",
  };
}

function fee(
  status: Schemas["BookingFee"]["status"],
  overrides: Partial<Schemas["BookingFee"]> = {},
): Schemas["BookingFee"] {
  return {
    id: "fee-1",
    status,
    amount_paise: 15_000,
    travel_compensation_paise: 0,
    platform_share_paise: 0,
    receipt_series: "",
    receipt_sequence: null,
    settlement_reason_code: "",
    failure_code: "",
    payment_attempt_id: null,
    simulated_capture_available: false,
    activated_at: null,
    earned_at: null,
    settled_at: null,
    ...overrides,
  };
}

function state(
  overrides: Partial<Schemas["RateCardState"]> = {},
): Schemas["RateCardState"] {
  return {
    preview: {
      is_available: true,
      rate_card_id: "card-1",
      headcount: 3,
      days: 1,
      day_rate_paise: 90_000,
      total_customer_paise: 270_000,
      lead_receipt_paise: 255_000,
      lead_day_receipt_paise: 255_000,
      booking_fee_paise: 15_000,
      standard_day_hours: 8,
      overtime_hourly_paise: 15_000,
      add_on_rates: {},
      inclusions: [],
      unavailable_code: null,
      unavailable_reason: null,
      server_now: "2026-09-02T06:00:00.000Z",
    },
    booking: booking(),
    booking_fee: fee("OFFER_ACCEPTED"),
    cascade: null,
    checkout_available: true,
    confirmed_partner_id: null,
    confirmed_partner_name: null,
    engagement_id: null,
    server_now: "2026-09-02T06:00:00.000Z",
    ...overrides,
  };
}

const checkout: Schemas["AccessCheckout"] = {
  payment_attempt_id: "attempt-new",
  amount_paise: 15_000,
  currency: "INR",
  provider: "fake",
  provider_order_id: "fake_order_attempt_new",
  status: "CREATED",
  expires_at: null,
  server_now: "2026-09-02T06:00:00.000Z",
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderPanel() {
  return render(
    <CrewDispatchPanel
      requirementId="req-1"
      bookCrewFeeHref="/requests/req-1/book-crew"
    />,
    { wrapper },
  );
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

describe("request-detail crew payment", () => {
  it("starts checkout and captures a fake payment in one click", async () => {
    client.GET.mockResolvedValue(ok(state()));
    client.POST.mockImplementation((path: string) => {
      if (path === "/api/v1/requirements/{requirement_id}/booking-fee/checkout/") {
        return Promise.resolve(ok(checkout, 201));
      }
      return Promise.resolve(ok({}));
    });
    renderPanel();

    const confirm = await screen.findByRole("button", { name: "Pay ₹150 & confirm" });
    expect(confirm.closest("a")).toBeNull();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/payment-attempts/{attempt_id}/simulate-capture/",
        { params: { path: { attempt_id: "attempt-new" } } },
      ),
    );
  });

  it("recovers an already-pending fake payment on the request page", async () => {
    client.GET.mockResolvedValue(
      ok(
        state({
          booking_fee: fee("PENDING", {
            payment_attempt_id: "attempt-existing",
            simulated_capture_available: true,
          }),
          checkout_available: false,
        }),
      ),
    );
    client.POST.mockResolvedValue(ok({}));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Mark as paid" }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/payment-attempts/{attempt_id}/simulate-capture/",
        { params: { path: { attempt_id: "attempt-existing" } } },
      ),
    );
    expect(client.POST).not.toHaveBeenCalledWith(
      "/api/v1/requirements/{requirement_id}/booking-fee/checkout/",
      expect.anything(),
    );
  });

  it("shows Pay again after failure and captures the replacement attempt", async () => {
    client.GET.mockResolvedValue(
      ok(
        state({
          booking_fee: fee("FAILED", {
            payment_attempt_id: "attempt-failed",
            failure_code: "payment_failed",
          }),
        }),
      ),
    );
    client.POST.mockImplementation((path: string) => {
      if (path === "/api/v1/requirements/{requirement_id}/booking-fee/checkout/") {
        return Promise.resolve(ok(checkout, 201));
      }
      return Promise.resolve(ok({}));
    });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Pay again" }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/payment-attempts/{attempt_id}/simulate-capture/",
        { params: { path: { attempt_id: "attempt-new" } } },
      ),
    );
  });
});
