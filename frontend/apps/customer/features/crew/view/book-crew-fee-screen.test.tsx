import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The booking-fee confirmation — `M2-FE-428`.
 *
 * Two rules carry the weight here and both are about restraint: the screen must
 * not name the supervisor while the offer is only held, and the dialog must not
 * charge anything until it is confirmed.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { BookCrewFeeScreen } = await import("./book-crew-fee-screen");

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function booking(
  overrides: Partial<Schemas["RateCardBooking"]> = {},
): Schemas["RateCardBooking"] {
  return {
    id: "booking-1",
    status: "OFFER_HELD",
    headcount: 3,
    days: 2,
    day_rate_paise: 90_000,
    total_customer_paise: 540_000,
    lead_receipt_paise: 510_000,
    lead_day_receipt_paise: 255_000,
    booking_fee_paise: 30_000,
    standard_day_hours: 8,
    overtime_hourly_paise: 15_000,
    add_on_rates: {},
    inclusions: [],
    wave: 1,
    hold_expires_at: "2099-01-01T00:00:00.000Z",
    fallback_reason_code: "",
    fell_back_at: null,
    confirmed_at: null,
    created_at: "2026-08-18T10:00:00.000Z",
    ...overrides,
  } as Schemas["RateCardBooking"];
}

function state(
  overrides: Partial<Schemas["RateCardState"]> = {},
): Schemas["RateCardState"] {
  return {
    preview: {
      is_available: true,
      rate_card_id: "card-1",
      headcount: 3,
      days: 2,
      day_rate_paise: 90_000,
      total_customer_paise: 540_000,
      lead_receipt_paise: 510_000,
      lead_day_receipt_paise: 255_000,
      booking_fee_paise: 30_000,
      standard_day_hours: 8,
      overtime_hourly_paise: 15_000,
      add_on_rates: {},
      inclusions: [],
      unavailable_code: null,
      unavailable_reason: null,
      server_now: "2026-08-18T10:00:00.000Z",
    },
    booking: booking(),
    booking_fee: null,
    cascade: null,
    checkout_available: true,
    // The server withholds identity until the fee is verified. A fixture that
    // supplied a name here would be testing a state the API cannot produce.
    confirmed_partner_id: null,
    confirmed_partner_name: null,
    engagement_id: null,
    server_now: "2026-08-18T10:00:00.000Z",
    ...overrides,
  } as Schemas["RateCardState"];
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

function renderScreen() {
  return render(
    <BookCrewFeeScreen requirementId="req-1" requestHref="/requests/req-1" />,
    { wrapper },
  );
}

describe("BookCrewFeeScreen", () => {
  it("does not name the supervisor while the offer is only held", async () => {
    client.GET.mockResolvedValue(ok(state()));
    renderScreen();

    // Vendor identity is released by the confirmation, never by the hold —
    // otherwise anybody reaching this screen and never paying would collect the
    // identities of the leads who accepted.
    expect(await screen.findByText(/A supervisor accepted your job/)).toBeInTheDocument();
    expect(
      screen.getByText(/introduce them by name the moment the booking is confirmed/),
    ).toBeInTheDocument();
  });

  it("shows the fee as the rail's hero and the crew's cash separately", async () => {
    client.GET.mockResolvedValue(ok(state()));
    renderScreen();

    expect(await screen.findByText("₹300")).toBeInTheDocument();
    expect(screen.getByText("₹5,100")).toBeInTheDocument();
    // The per-day figure is the server's `lead_day_receipt_paise`, not the total
    // divided by the day count.
    expect(screen.getByText("₹2,550 at the end of each day")).toBeInTheDocument();
  });

  it("charges nothing until the dialog is confirmed", async () => {
    client.GET.mockResolvedValue(ok(state()));
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /Pay ₹300 and confirm/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(client.POST).not.toHaveBeenCalled();

    // Dismissing is a cancel. The hold survives it and nothing is charged.
    fireEvent.click(within(dialog).getByRole("button", { name: "Not now" }));
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("starts the checkout only from the dialog's own action", async () => {
    client.GET.mockResolvedValue(ok(state()));
    client.POST.mockResolvedValue(ok({ payment_attempt_id: "attempt-1" }, 201));
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /Pay ₹300 and confirm/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Pay ₹300" }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/requirements/{requirement_id}/booking-fee/checkout/",
        expect.anything(),
      ),
    );
  });

  it("offers nothing to press while a charge is in flight", async () => {
    client.GET.mockResolvedValue(
      ok(
        state({
          checkout_available: false,
          booking_fee: {
            status: "PENDING",
            amount_paise: 30_000,
          } as Schemas["BookingFee"],
        }),
      ),
    );
    renderScreen();

    // Every control that could exist against a pending charge is a way to pay
    // the booking fee twice.
    expect(await screen.findByText(/confirming your payment/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pay ₹300/ })).not.toBeInTheDocument();
  });
});
