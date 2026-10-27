import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withI18n } from "@/i18n/test-utils";

/**
 * The owner's delivery panel: the quote form, and the 0% transport commission the owner
 * decision (R-5) says must be shown wherever a transport amount is.
 */

const queries = vi.hoisted(() => ({
  fetchTransportFeePercent: vi.fn(),
  partnerRentalTransportAction: vi.fn(),
}));
// `@` resolves to the Customer app under Vitest, so the partner queries are supplied here.
vi.mock("@/features/rentals/queries", () => queries);

const { DeliverySection, transportPayout } = await import("./delivery-section");

function booking(
  transport: Partial<Schemas["RentalTransport"]>,
  overrides: Partial<Schemas["PartnerRentalBooking"]> = {},
): Schemas["PartnerRentalBooking"] {
  return {
    id: "booking-1",
    status: "AWAITING_TRANSPORT_QUOTE",
    start_date: "2026-10-20",
    end_date: "2026-10-22",
    quantity: 1,
    price_paise: 100000,
    platform_fee_percent: 0,
    platform_fee_paise: 0,
    pickup_or_delivery_mode: "DELIVERY",
    delivery_address: {
      line: "Flat 302, Lake View",
      area: "Gachibowli",
      city: "Hyderabad",
      pincode: "500032",
      contact_phone: "9876543210",
    },
    transport_paise: 0,
    transport_fee_percent: 0,
    transport_fee_paise: 0,
    amount_due_paise: 300000,
    transport: {
      id: "t-1",
      status: "REQUESTED",
      trip: null,
      customer_note: "Third floor, lift available",
      reject_note: "",
      decline_reason: "",
      quote_paise: null,
      quote_note: "",
      quote_count: 0,
      max_quotes: 3,
      respond_by: "2026-10-09T10:00:00Z",
      requested_at: "2026-10-08T10:00:00Z",
      quoted_at: null,
      accepted_at: null,
      delivered_at: null,
      ...transport,
    },
    pickup_hours: { is_set: false, days: [], summary: "", closed_dates: [] },
    notes: "",
    asset: {} as Schemas["RentalAsset"],
    deposit: {} as Schemas["RentalDeposit"],
    handover_pin: null,
    created_at: "2026-10-08T10:00:00Z",
    customer_name: "Asha",
    customer_phone: "9876543210",
    ...overrides,
  };
}

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return withI18n(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queries.fetchTransportFeePercent.mockResolvedValue(0);
  queries.partnerRentalTransportAction.mockResolvedValue({});
});

afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

describe("DeliverySection", () => {
  it("keeps the full transport price at 0%", () => {
    expect(transportPayout(75000, 0)).toBe(75000);
    expect(transportPayout(75000, 10)).toBe(67500);
  });

  it("shows where to deliver and the customer's note", () => {
    render(<DeliverySection booking={booking({})} />, { wrapper });
    const panel = screen.getByTestId("delivery-section");
    expect(panel).toHaveTextContent("Flat 302, Lake View, Gachibowli, Hyderabad 500032");
    expect(panel).toHaveTextContent("Customer’s note: Third floor, lift available");
    expect(screen.getByRole("link", { name: /9876543210/ })).toHaveAttribute("href", "tel:9876543210");
  });

  it("tells the owner they keep the whole transport price as they type", () => {
    render(<DeliverySection booking={booking({})} />, { wrapper });
    fireEvent.change(document.getElementById("transport-amount-booking-1")!, {
      target: { value: "750" },
    });
    expect(screen.getByTestId("transport-commission")).toHaveTextContent(
      "Transport commission: 0% — you receive the full ₹750",
    );
  });

  it("sends the price in paise with the trip", async () => {
    render(<DeliverySection booking={booking({})} />, { wrapper });
    fireEvent.change(document.getElementById("transport-amount-booking-1")!, {
      target: { value: "750" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Drop and collect" }));
    fireEvent.click(screen.getByRole("button", { name: "Send price" }));
    await waitFor(() => expect(queries.partnerRentalTransportAction).toHaveBeenCalled());
    expect(queries.partnerRentalTransportAction).toHaveBeenCalledWith("booking-1", "quote", {
      amount_paise: 75000,
      trip: "ROUND_TRIP",
      note: "",
    });
  });

  it("asks for a price before sending", () => {
    render(<DeliverySection booking={booking({})} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Send price" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the transport price");
    expect(queries.partnerRentalTransportAction).not.toHaveBeenCalled();
  });

  it("shows the agreed amount with 0% commission after the customer pays", () => {
    render(
      <DeliverySection
        booking={booking(
          { status: "ACCEPTED", quote_paise: 75000, trip: "ONE_WAY", quote_count: 1 },
          { status: "CONFIRMED", transport_paise: 75000 },
        )}
      />,
      { wrapper },
    );
    expect(screen.getByTestId("transport-agreed")).toHaveTextContent(
      "Agreed transport: ₹750 (Drop only) · 0% commission — you receive ₹750",
    );
    expect(screen.getByRole("button", { name: "Mark out for delivery" })).toBeInTheDocument();
  });
});
