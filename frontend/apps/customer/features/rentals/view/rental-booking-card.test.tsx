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
    pickup_at: "2026-09-05T04:30:00Z",
    return_at: "2026-09-08T04:30:00Z",
    rental_days: 2,
    pickup_contact: null,
    quantity: 1,
    price_paise: 150000,
    pickup_or_delivery_mode: "PICKUP",
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
  it("shows where to collect, the owner's number and a maps link once confirmed", () => {
    const booking = mockBooking({
      pickup_contact: {
        owner_name: "Tool Master",
        owner_phone: "+919800000000",
        address: "Madhapur, Hyderabad",
      },
    });
    render(<RentalBookingCard booking={booking} />, { wrapper });

    expect(screen.getByText("Collect from the owner")).toBeInTheDocument();
    expect(screen.getByText("Madhapur, Hyderabad")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Call Tool Master/ })).toHaveAttribute(
      "href",
      "tel:+919800000000",
    );
    expect(screen.getByRole("link", { name: /Open in Maps/ })).toHaveAttribute(
      "href",
      expect.stringContaining("Madhapur%2C%20Hyderabad"),
    );
  });

  it("hides the owner's contact until the server shares it", () => {
    render(<RentalBookingCard booking={mockBooking({ pickup_contact: null })} />, { wrapper });
    expect(screen.queryByTestId("pickup-contact")).not.toBeInTheDocument();
  });
});
