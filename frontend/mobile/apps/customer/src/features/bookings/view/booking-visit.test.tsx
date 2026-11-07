// Ported from frontend/apps/customer/features/bookings/view/booking-visit-screen.test.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { BookingVisit } from "./booking-visit";

const mockClient = { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), PUT: jest.fn(), DELETE: jest.fn() };

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => mockClient,
  useCompleteOrOpenCheckout: () => jest.fn(),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const mockGroup = {
  id: "group-1",
  status: "BOOKED" as const,
  order_id: "order-1",
  units: [
    {
      id: "unit-1",
      booking_id: "booking-1",
      status: "BOOKED" as const,
      booking_status: "CONFIRMED" as const,
      starts_at: "2026-08-10T10:00:00+05:30",
      arrival_window_minutes: 60,
      estimated_duration_minutes: 45,
      lines: [{ id: "l1", label: "Pipe Repair", quantity: 1, amount: { amount_paise: 50000, currency: "INR" } }],
      total: { amount_paise: 50000, currency: "INR" },
      professional: null,
    },
  ],
};

const mockVisit = {
  id: "booking-1",
  fulfilment_unit_id: "unit-1",
  status: "CONFIRMED" as const,
  version: 1,
  scheduled_start: "2026-08-10T10:00:00+05:30",
  estimated_duration_minutes: 45,
  partner_display_name: "Rahul Verma",
  partner_phone: "+919876543210",
  en_route_at: null,
  arrived_at: null,
  late_declared_at: null,
  cancelled_at: null,
  cancellation_reason: "",
  work_tasks: [],
  active_amendment: null,
  completion: null,
  cancellation_preview: {
    band_code: "FREE",
    fee_paise: 0,
    fee_waiver: "",
    refund_paise: 50000,
    currency: "INR",
  },
  reschedule_preview: {
    is_available: true,
    unavailable_reason: "",
    earliest_start: "2026-08-11T10:00:00+05:30",
  },
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(mockClient)) method.mockReset();
});

describe("BookingVisit screen", () => {
  it("renders loading state when visit is pending", async () => {
    mockClient.GET.mockReturnValue(new Promise(() => {}));

    const view = await render(<BookingVisit groupId="group-1" bookingId="booking-1" />, { wrapper });
    expect(view.getByText("Loading this visit…")).toBeTruthy();
  });

  it("renders error state when visit fails to load", async () => {
    mockClient.GET.mockRejectedValue(
      new ApiRequestError(404, { code: "not_found", message: "Not found", details: null, retryable: false, request_id: "r1" }),
    );

    const view = await render(<BookingVisit groupId="group-1" bookingId="booking-1" />, { wrapper });
    expect(await view.findByText("We could not load this visit")).toBeTruthy();
  });

  it("renders visit details, actions, and responds to cancel sheet trigger", async () => {
    mockClient.GET.mockImplementation((path: string) => {
      if (path.includes("/api/v1/booking-groups/")) return Promise.resolve(ok(mockGroup));
      if (path.includes("/api/v1/bookings/")) return Promise.resolve(ok(mockVisit));
      return Promise.resolve(ok({}));
    });

    const view = await render(<BookingVisit groupId="group-1" bookingId="booking-1" />, { wrapper });

    expect(await view.findByText("Rahul Verma")).toBeTruthy();
    expect(view.getByText("Cancel this visit")).toBeTruthy();
    expect(view.getByText("Reschedule")).toBeTruthy();

    // Tap Cancel this visit to open sheet
    fireEvent.press(view.getByText("Cancel this visit"));
    expect(await view.findByText("Why are you cancelling?")).toBeTruthy();
  });
});
