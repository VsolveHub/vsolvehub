import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { group, refusal, unit, unitLine } from "@/features/bookings/fixtures";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { BookingVisitScreen } = await import("./booking-visit-screen");
const { VisitPanel } = await import("@/features/visit/view/visit-panel");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const bookedVisit = {
  id: "booking-1",
  fulfilment_unit_id: "fu-1",
  status: "CONFIRMED",
  version: 1,
  scheduled_start: "2026-08-04T10:00:00Z",
  estimated_duration_minutes: 45,
  partner_display_name: "Carpenter Pro",
  en_route_at: null,
  arrived_at: null,
  work_tasks: [],
  completion: null,
  reschedule_preview: { is_available: true, unavailable_reason: "" },
  scope_amendments: [],
  server_now: "2026-08-03T09:00:00Z",
  next_transition_at: null,
};

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

describe("BookingVisitScreen", () => {
  it("names the visit position inside a multi-visit booking", async () => {
    client.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") {
        return Promise.resolve(
          ok(
            group({
              status: "BOOKED",
              order_id: "order-1",
              units: [
                unit({
                  id: "fu-1",
                  position: 0,
                  status: "BOOKED",
                  booking_id: "booking-1",
                  booking_status: "CONFIRMED",
                }),
                unit({
                  id: "fu-2",
                  position: 1,
                  status: "BOOKED",
                  booking_id: "booking-2",
                  booking_status: "CONFIRMED",
                  lines: [unitLine({ id: "ul-2", label: "Switch Board Replacement" })],
                }),
              ],
            }),
          ),
        );
      }
      if (path === "/api/v1/bookings/{booking_id}/") return Promise.resolve(ok(bookedVisit));
      return Promise.resolve(refusal("not_found", 404));
    });

    render(<BookingVisitScreen groupId="group-1" bookingId="booking-2" />, { wrapper });

    expect(await screen.findByRole("heading", { name: "Visit 2 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to this booking/i })).toHaveAttribute(
      "href",
      "/bookings/group-1",
    );
  });
});

describe("VisitPanel", () => {
  it("renders the booked service and payment lines from the group unit", async () => {
    client.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") {
        return Promise.resolve(
          ok(
            group({
              status: "BOOKED",
              order_id: "order-1",
              units: [
                unit({
                  id: "fu-1",
                  position: 0,
                  status: "BOOKED",
                  booking_id: "booking-1",
                  booking_status: "CONFIRMED",
                  professional: {
                    display_name: "Carpenter Pro",
                    headline: "Bed Assembly",
                    experience_years: 5,
                  },
                  lines: [unitLine({ id: "ul-1", label: "Cupboard / Hinge Repair" })],
                }),
              ],
            }),
          ),
        );
      }
      if (path === "/api/v1/bookings/{booking_id}/") return Promise.resolve(ok(bookedVisit));
      return Promise.resolve(refusal("not_found", 404));
    });

    render(<VisitPanel bookingId="booking-1" groupId="group-1" />, { wrapper });

    expect(await screen.findByText("Real Partner Details Unlocked")).toBeInTheDocument();
    expect(screen.getAllByText("Cupboard / Hinge Repair").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Payment summary" })).toBeInTheDocument();
    expect(screen.getByText("Visit total")).toBeInTheDocument();
    expect(screen.getByText("Carpenter Pro")).toBeInTheDocument();
  });

  it("shows this visit's payment, not a sibling visit's", async () => {
    client.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") {
        return Promise.resolve(
          ok(
            group({
              status: "BOOKED",
              order_id: "order-1",
              units: [
                unit({
                  id: "fu-1",
                  position: 0,
                  status: "BOOKED",
                  booking_id: "booking-1",
                  booking_status: "CONFIRMED",
                  lines: [unitLine({ id: "ul-1", label: "Software Installation" })],
                }),
                unit({
                  id: "fu-2",
                  position: 1,
                  status: "BOOKED",
                  booking_id: "booking-2",
                  booking_status: "CONFIRMED",
                  lines: [unitLine({ id: "ul-2", label: "Geyser repair" })],
                }),
              ],
            }),
          ),
        );
      }
      if (path === "/api/v1/bookings/{booking_id}/") {
        return Promise.resolve(ok({ ...bookedVisit, id: "booking-2" }));
      }
      return Promise.resolve(refusal("not_found", 404));
    });

    render(<VisitPanel bookingId="booking-2" groupId="group-1" />, { wrapper });

    expect(await screen.findByRole("heading", { name: "Payment summary" })).toBeInTheDocument();
    expect(screen.getAllByText("Geyser repair").length).toBeGreaterThan(0);
    expect(screen.queryByText("Software Installation")).not.toBeInTheDocument();
  });
});
