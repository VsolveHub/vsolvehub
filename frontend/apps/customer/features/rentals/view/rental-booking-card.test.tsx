import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import { ToastProvider } from "@vsolve/ui";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { RentalBookingCard } = await import("./rental-booking-card");

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function errorResponse(code: string, message: string, status = 400) {
  return {
    data: undefined,
    error: {
      error: {
        code,
        message,
        details: null,
        retryable: false,
        request_id: "req_cancel_err",
      },
    },
    response: new Response(null, { status }),
  };
}

function mockBooking(overrides: Partial<Schemas["RentalBooking"]> = {}): Schemas["RentalBooking"] {
  return {
    id: "booking-1",
    status: "CONFIRMED",
    start_date: "2026-09-05",
    end_date: "2026-09-08",
    quantity: 1,
    price_paise: 150000,
    pickup_or_delivery_mode: "PICKUP",
    delivery_address: {},
    transport_paise: 0,
    transport_fee_percent: 0,
    transport_fee_paise: 0,
    amount_due_paise: 300000,
    transport: null,
    pickup_hours: { is_set: false, days: [], summary: "" },
    notes: "",
    asset: {
      id: "asset-1",
      slug: "commercial-concrete-mixer",
      partner_name: "Pro Equipment Hub",
      variant: "variant-1",
      title: "Commercial Concrete Mixer",
      description: "Standard portable electric concrete mixer.",
      location_text: "Indiranagar, Bengaluru",
      quantity_available: 3,
      daily_rate_paise: 50000,
      deposit_paise: 150000,
      condition_grade: "GOOD",
      current_status: "ACTIVE",
      moderation_status: "APPROVED",
      public_state: "PUBLISHED",
      structured_fields: {},
      media: [],
      pickup_address_line: "Shop 4, Main Road",
      pickup_area: "Koramangala",
      pickup_city: "Bengaluru",
      pickup_pincode: "560034",
      pickup_address: {
        partner_name: "Tool Master Rentals",
        line: "Shop 4, Main Road",
        area: "Koramangala",
        city: "Bengaluru",
        pincode: "560034",
        maps_url: "https://www.google.com/maps/search/?api=1&query=Shop%204%2C%20Main%20Road",
      },
      delivery_available: false,
      created_at: "2026-08-01T10:00:00Z",
    },
    deposit: {
      id: "deposit-1",
      amount_paise: 150000,
      status: "HELD",
      payment_attempt_id: "attempt-1",
      simulated_capture_available: true,
    },
    handover_pin: "7492",
    created_at: "2026-09-05T10:00:00Z",
    ...overrides,
  };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ToastProvider>
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
});

describe("RentalBookingCard", () => {
  it("displays handover PIN when present on the booking", () => {
    const booking = mockBooking({ handover_pin: "7492" });
    render(<RentalBookingCard booking={booking} />, { wrapper });

    expect(screen.getByTestId("handover-pin")).toBeInTheDocument();
    expect(screen.getByText("Handover PIN")).toBeInTheDocument();
    expect(screen.getByText("7492")).toBeInTheDocument();
    expect(
      screen.getByText("Share this PIN with the partner when you collect the equipment."),
    ).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("does not show handover PIN when handover_pin is null", () => {
    const booking = mockBooking({ handover_pin: null });
    render(<RentalBookingCard booking={booking} />, { wrapper });

    expect(screen.queryByTestId("handover-pin")).not.toBeInTheDocument();
    expect(screen.queryByText("Handover PIN")).not.toBeInTheDocument();
  });

  it("does not show handover PIN when handover_pin is empty whitespace", () => {
    const booking = mockBooking({ handover_pin: "   " });
    render(<RentalBookingCard booking={booking} />, { wrapper });

    expect(screen.queryByTestId("handover-pin")).not.toBeInTheDocument();
    expect(screen.queryByText("Handover PIN")).not.toBeInTheDocument();
  });

  it("renders booking details, asset title, partner name, and badges", () => {
    const booking = mockBooking();
    render(<RentalBookingCard booking={booking} />, { wrapper });

    expect(screen.getByText("Commercial Concrete Mixer")).toBeInTheDocument();
    expect(screen.getByText("Pro Equipment Hub")).toBeInTheDocument();
    expect(screen.getByText("Booking Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Deposit Held (Protected)")).toBeInTheDocument();
    expect(screen.getByText("₹1,500")).toBeInTheDocument();
    expect(screen.getByText("Self pickup")).toBeInTheDocument();
  });

  it("allows cancelling a confirmed booking with confirmation step", async () => {
    const booking = mockBooking({ status: "CONFIRMED" });
    client.POST.mockResolvedValue(ok({ ...booking, status: "CANCELLED" }));

    render(<RentalBookingCard booking={booking} />, { wrapper });

    const cancelBtn = screen.getByRole("button", { name: "Cancel booking" });
    fireEvent.click(cancelBtn);

    expect(
      screen.getByText("Cancel before handover? Any captured payment will be refunded."),
    ).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: "Confirm cancel" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/me/rentals/{booking_id}/cancel",
        expect.objectContaining({
          params: { path: { booking_id: "booking-1" } },
        }),
      );
    });
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("renders friendly error message if cancel mutation fails", async () => {
    const booking = mockBooking({ status: "CONFIRMED" });
    client.POST.mockResolvedValue(
      errorResponse("rental_state_invalid", "Booking must be CONFIRMED to cancel.", 400),
    );

    render(<RentalBookingCard booking={booking} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancel" }));

    await waitFor(() => {
      expect(
        screen.getByText(/This rental cannot move to that step right now/),
      ).toBeInTheDocument();
    });
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("hides cancel button when booking is already handed over", () => {
    const booking = mockBooking({ status: "HANDOVER" });
    render(<RentalBookingCard booking={booking} />, { wrapper });

    expect(screen.queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();
  });

  it("shows the platform fee that was charged with the rental", () => {
    const booking = mockBooking({
      price_paise: 150000,
      platform_fee_percent: 10,
      platform_fee_paise: 15000,
    });
    render(<RentalBookingCard booking={booking} />, { wrapper });

    expect(screen.getByText("Platform fee (10%): ₹150")).toBeInTheDocument();
    expect(screen.getByText("₹1,650")).toBeInTheDocument();
  });

  it("shows Pay Now for pending payment bookings", () => {
    const booking = mockBooking({ status: "PENDING_PAYMENT" });
    render(<RentalBookingCard booking={booking} />, { wrapper });

    expect(screen.getByRole("button", { name: "Pay Now" })).toBeInTheDocument();
  });

  function transport(overrides: Partial<Schemas["RentalTransport"]> = {}): Schemas["RentalTransport"] {
    return {
      id: "transport-1",
      status: "QUOTED",
      trip: "ROUND_TRIP",
      customer_note: "",
      reject_note: "",
      decline_reason: "",
      quote_paise: 75000,
      quote_note: "Tata Ace",
      quote_count: 1,
      max_quotes: 3,
      respond_by: "2026-09-04T10:00:00Z",
      requested_at: "2026-09-03T10:00:00Z",
      quoted_at: "2026-09-03T12:00:00Z",
      accepted_at: null,
      delivered_at: null,
      ...overrides,
    };
  }

  function deliveryBooking(t: Partial<Schemas["RentalTransport"]>) {
    return mockBooking({
      status: "AWAITING_TRANSPORT_QUOTE",
      pickup_or_delivery_mode: "DELIVERY",
      handover_pin: null,
      amount_due_paise: 300000,
      delivery_address: { line: "Flat 302", city: "Hyderabad", pincode: "500032", contact_phone: "9876543210" },
      deposit: {
        id: "deposit-1",
        amount_paise: 150000,
        status: "REQUESTED",
        payment_attempt_id: null,
        simulated_capture_available: false,
      },
      transport: transport(t),
    });
  }

  it("shows the owner's transport price and the one total to pay", () => {
    render(<RentalBookingCard booking={deliveryBooking({})} />, { wrapper });

    const panel = screen.getByTestId("delivery-request");
    expect(panel).toHaveTextContent("Transport price received");
    expect(panel).toHaveTextContent("₹750");
    expect(panel).toHaveTextContent("Drop and collect");
    expect(panel).toHaveTextContent("Owner’s note: Tata Ace");
    // ₹3,000 rent, fee and deposit + ₹750 transport.
    expect(screen.getByRole("button", { name: "Accept & pay ₹3,750" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.queryByTestId("pickup-location")).not.toBeInTheDocument();
  });

  it("accepting posts accept for this booking", async () => {
    client.POST.mockResolvedValue(ok(deliveryBooking({ status: "ACCEPTED" })));
    render(<RentalBookingCard booking={deliveryBooking({})} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Accept & pay ₹3,750" }));
    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    expect(client.POST.mock.calls[0]![1].params.path).toEqual({
      booking_id: "booking-1",
      action: "accept",
    });
  });

  it("waiting for a price says nothing is charged yet", () => {
    render(
      <RentalBookingCard booking={deliveryBooking({ status: "REQUESTED", quote_paise: null, trip: null })} />,
      { wrapper },
    );
    expect(screen.getByTestId("delivery-request")).toHaveTextContent(
      "Nothing is charged until you accept it.",
    );
    expect(screen.queryByRole("button", { name: /Accept/ })).not.toBeInTheDocument();
  });

  it("a declined request offers self pickup instead", () => {
    render(
      <RentalBookingCard
        booking={deliveryBooking({ status: "DECLINED", quote_paise: null, trip: null })}
      />,
      { wrapper },
    );
    expect(screen.getByText("The owner can’t deliver this one")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch to self pickup & pay ₹3,000" }),
    ).toBeInTheDocument();
  });

  it("a self pickup booking shows where to collect it", () => {
    render(<RentalBookingCard booking={mockBooking()} />, { wrapper });
    expect(screen.getByTestId("pickup-location")).toHaveTextContent("Shop 4, Main Road");
    expect(screen.getByRole("link", { name: /View Location/ })).toBeInTheDocument();
  });
});

