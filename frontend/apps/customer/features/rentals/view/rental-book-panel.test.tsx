import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import { queryKeys } from "@vsolve/query";
import { ToastProvider } from "@vsolve/ui";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const { RentalBookPanel } = await import("./rental-book-panel");

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
        request_id: "req_test",
      },
    },
    response: new Response(null, { status }),
  };
}

function mockAsset(overrides: Partial<Schemas["RentalAsset"]> = {}): Schemas["RentalAsset"] {
  return {
    id: "asset-1",
    slug: "demo-mixer",
    partner_id: "partner-1",
    partner_name: "Tool Master Rentals",
    partner_phone: "+919876500001",
    variant: "variant-1",
    title: "Heavy Duty Rotary Hammer Drill",
    description: "Ideal for concrete and masonry drilling.",
    location_text: "Koramangala, Bengaluru",
    quantity_available: 5,
    daily_rate_paise: 50000, // ₹500
    deposit_paise: 200000, // ₹2,000
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
    pickup_latitude: null,
    pickup_longitude: null,
    pickup_address: {
      partner_name: "Tool Master Rentals",
      line: "Shop 4, Main Road",
      area: "Koramangala",
      city: "Bengaluru",
      pincode: "560034",
      latitude: null,
      longitude: null,
      maps_url: "https://www.google.com/maps/search/?api=1&query=Shop%204%2C%20Main%20Road",
    },
    delivery_available: false,
    distance_km: null,
    created_at: "2026-08-01T10:00:00Z",
    ...overrides,
  };
}

function mockBooking(overrides: Partial<Schemas["RentalBooking"]> = {}): Schemas["RentalBooking"] {
  return {
    id: "booking-1",
    status: "CONFIRMED",
    start_date: "2026-09-01",
    end_date: "2026-09-03",
    quantity: 1,
    price_paise: 100000,
    pickup_or_delivery_mode: "PICKUP",
    delivery_address: {},
    transport_paise: 0,
    transport_fee_percent: 0,
    transport_fee_paise: 0,
    amount_due_paise: 300000,
    transport: null,
    pickup_hours: { is_set: false, days: [], summary: "", closed_dates: [] },
    notes: "",
    asset: mockAsset(),
    deposit: {
      id: "deposit-1",
      amount_paise: 200000,
      status: "HELD",
      payment_attempt_id: "attempt-1",
      simulated_capture_available: true,
    },
    handover_pin: "4821",
    created_at: "2026-09-01T10:00:00Z",
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
  router.push.mockReset();
  router.replace.mockReset();
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

describe("RentalBookPanel", () => {
  it("renders booking panel with duration and deposit calculation", () => {
    render(<RentalBookPanel asset={mockAsset()} />, { wrapper });

    expect(screen.getByRole("heading", { name: "Book This Rental" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Self Pickup" })).toBeChecked();
    expect(screen.getByText("Refundable Security Deposit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Rental Booking" })).toBeInTheDocument();
    expect(screen.queryByText(/Platform fee/)).not.toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("shows the platform fee on top of the rental and adds it to the total", async () => {
    client.GET.mockResolvedValue(ok({ percent: 10 }));

    render(<RentalBookPanel asset={mockAsset()} />, { wrapper });

    expect(await screen.findByText("Platform fee (10%)")).toBeInTheDocument();
    // Two days at ₹500, plus 10% (₹100), plus the ₹2,000 deposit.
    expect(screen.getByText("₹3,100")).toBeInTheDocument();
  });

  it("shows permanently out of stock banner and disables button when quantity_available is 0", () => {
    const oosAsset = mockAsset({ quantity_available: 0 });
    render(<RentalBookPanel asset={oosAsset} />, { wrapper });

    expect(screen.getAllByText("Out of stock").length).toBeGreaterThanOrEqual(2);
    const button = screen.getByRole("button", { name: "Out of stock" });
    expect(button).toBeDisabled();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("shows friendly OOS message and blocks submission on out_of_stock error", async () => {
    client.POST.mockResolvedValue(
      errorResponse("out_of_stock", "Out of stock for those dates.", 400),
    );

    render(<RentalBookPanel asset={mockAsset()} />, { wrapper });

    const submitBtn = screen.getByRole("button", { name: "Confirm Rental Booking" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Out of stock for these dates. Try different dates or another listing."),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: "Unavailable for these dates" }),
    ).toBeDisabled();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("shows friendly OOS message on insufficient_quantity error", async () => {
    client.POST.mockResolvedValue(
      errorResponse(
        "insufficient_quantity",
        "Not enough quantity available for those dates.",
        400,
      ),
    );

    render(<RentalBookPanel asset={mockAsset()} />, { wrapper });

    const submitBtn = screen.getByRole("button", { name: "Confirm Rental Booking" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Not enough quantity available for these dates. Try different dates."),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: "Unavailable for these dates" }),
    ).toBeDisabled();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("handles successful booking creation without payment attempt", async () => {
    const bookingWithoutPayment = mockBooking({
      deposit: {
        id: "dep-1",
        amount_paise: 200000,
        status: "HELD",
        payment_attempt_id: null,
        simulated_capture_available: false,
      },
    });
    client.POST.mockResolvedValue(ok(bookingWithoutPayment, 201));

    render(<RentalBookPanel asset={mockAsset()} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Confirm Rental Booking" }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/rentals/mine");
    });
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("shows the pickup address with a View Location link to Google Maps", () => {
    render(<RentalBookPanel asset={mockAsset()} />, { wrapper });

    const block = screen.getByTestId("pickup-location");
    expect(block).toHaveTextContent("Tool Master Rentals");
    expect(block).toHaveTextContent("Shop 4, Main Road");
    expect(block).toHaveTextContent("Koramangala, Bengaluru 560034");
    const link = screen.getByRole("link", { name: /View Location/ });
    expect(link).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Shop%204%2C%20Main%20Road",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Free (self pickup)")).toBeInTheDocument();
  });

  it("shows the owner's hours per day", () => {
    const days = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      day_name: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][weekday]!,
      is_open: weekday !== 0,
      opens_at: weekday === 0 ? null : "09:00",
      closes_at: weekday === 0 ? null : weekday === 6 ? "18:00" : "21:00",
    }));
    render(
      <RentalBookPanel
        asset={{ ...mockAsset(), pickup_hours: { is_set: true, days, summary: "", closed_dates: [] } }}
      />,
      { wrapper },
    );
    const block = screen.getByTestId("pickup-location");
    expect(block).toHaveTextContent("Saturday");
    expect(block).toHaveTextContent("9 AM – 9 PM");
    expect(block).toHaveTextContent("9 AM – 6 PM");
    expect(block).toHaveTextContent("Closed");
  });

  it("offers delivery only when the owner does", () => {
    render(<RentalBookPanel asset={mockAsset()} />, { wrapper });
    expect(screen.queryByRole("radio", { name: "Request Delivery" })).not.toBeInTheDocument();
    expect(screen.getByText("This owner offers self pickup only.")).toBeInTheDocument();
  });

  it("asks for a saved address instead of typed address fields", () => {
    render(<RentalBookPanel asset={mockAsset({ delivery_available: true })} />, { wrapper });

    fireEvent.click(screen.getByRole("radio", { name: "Request Delivery" }));

    expect(screen.queryByTestId("pickup-location")).not.toBeInTheDocument();
    expect(screen.getByText("Quoted by the owner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose delivery address" })).toBeInTheDocument();
    // No street, city or pincode to type: the address comes from the picker.
    expect(document.getElementById("delivery-line")).toBeNull();
    expect(document.getElementById("delivery-city")).toBeNull();
    expect(document.getElementById("delivery-pincode")).toBeNull();
  });

  it("refuses a delivery with no address chosen, before calling the server", async () => {
    render(<RentalBookPanel asset={mockAsset({ delivery_available: true })} />, { wrapper });
    fireEvent.click(screen.getByRole("radio", { name: "Request Delivery" }));
    fireEvent.click(screen.getByRole("button", { name: "Send delivery request" }));

    expect(await screen.findByText("Choose where to deliver.")).toBeInTheDocument();
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("automatically pre-fills saved address and profile phone for delivery with zero manual typing", async () => {
    const savedAddress: Schemas["Address"] = {
      id: "addr-home-1",
      label: "Home",
      line1: "Flat 402, Sunshine Apts",
      line2: "Main Road",
      locality: "Madhapur",
      city: "Hyderabad",
      state: "Telangana",
      postal_code: "500081",
      country_code: "IN",
      is_default: true,
      latitude: "17.448500",
      longitude: "78.375000",
      confirmed_at: "2026-08-01T10:00:00Z",
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-08-01T10:00:00Z",
    };

    queryClient.setQueryData(queryKeys.addresses.list(), [savedAddress]);
    queryClient.setQueryData(queryKeys.session.profile(), {
      id: "usr-1",
      phone_number: "+919876543210",
      full_name: "Test Customer",
    });

    client.POST.mockResolvedValue(
      ok(mockBooking({ status: "AWAITING_TRANSPORT_QUOTE", pickup_or_delivery_mode: "DELIVERY" }), 201),
    );

    render(<RentalBookPanel asset={mockAsset({ delivery_available: true })} />, { wrapper });

    fireEvent.click(screen.getByRole("radio", { name: "Request Delivery" }));

    // User should see their saved address card with label and verified details
    const addressCard = screen.getByTestId("selected-delivery-address");
    expect(within(addressCard).getByText("Home")).toBeInTheDocument();
    expect(within(addressCard).getByText("Default")).toBeInTheDocument();
    expect(within(addressCard).getByText("Verified Pin")).toBeInTheDocument();
    expect(within(addressCard).getByText(/Flat 402, Sunshine Apts, Main Road, Madhapur, Hyderabad, 500081/)).toBeInTheDocument();
    expect(within(addressCard).getByRole("button", { name: "Change" })).toBeInTheDocument();

    // Phone should be auto-filled from profile
    const phoneInput = document.getElementById("delivery-phone") as HTMLInputElement;
    expect(phoneInput.value).toBe("9876543210");

    // The user doesn't have to type anything! Just click "Send delivery request"
    fireEvent.click(screen.getByRole("button", { name: "Send delivery request" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/rentals/mine"));
    const body = client.POST.mock.calls[0]![1].body;
    expect(body.pickup_or_delivery_mode).toBe("DELIVERY");
    expect(body.delivery_address).toEqual({
      line: "Flat 402, Sunshine Apts, Main Road",
      area: "Madhapur",
      city: "Hyderabad",
      pincode: "500081",
      contact_phone: "9876543210",
      // The saved pin travels too, so the owner can route to the door.
      latitude: "17.448500",
      longitude: "78.375000",
    });
  });

  it("sends a different phone when the customer changes it", async () => {
    queryClient.setQueryData(queryKeys.addresses.list(), [
      {
        id: "addr-1",
        label: "Office",
        line1: "Plot 9",
        line2: "",
        locality: "Gachibowli",
        city: "Hyderabad",
        state: "Telangana",
        postal_code: "500032",
        country_code: "IN",
        is_default: true,
        latitude: "17.440000",
        longitude: "78.350000",
        confirmed_at: "2026-08-01T10:00:00Z",
        created_at: "2026-08-01T10:00:00Z",
        updated_at: "2026-08-01T10:00:00Z",
      } as Schemas["Address"],
    ]);
    client.POST.mockResolvedValue(
      ok(mockBooking({ status: "AWAITING_TRANSPORT_QUOTE", pickup_or_delivery_mode: "DELIVERY" }), 201),
    );
    render(<RentalBookPanel asset={mockAsset({ delivery_available: true })} />, { wrapper });

    fireEvent.click(screen.getByRole("radio", { name: "Request Delivery" }));
    fireEvent.change(document.getElementById("delivery-phone")!, { target: { value: "91234 56789" } });
    fireEvent.click(screen.getByRole("button", { name: "Send delivery request" }));

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    expect(client.POST.mock.calls[0]![1].body.delivery_address).toMatchObject({
      line: "Plot 9",
      pincode: "500032",
      contact_phone: "9123456789",
    });
  });
});
