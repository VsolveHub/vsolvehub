import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { unit } from "@/features/bookings/fixtures";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { SingleVisitDetailCard } = await import("./paid-visit-cards");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function visit(status: string) {
  return {
    id: "booking-1",
    fulfilment_unit_id: "fu-1",
    status,
    version: 3,
    scheduled_start: "2026-08-04T10:00:00Z",
    estimated_duration_minutes: 45,
    partner_display_name: "Rohith",
    en_route_at: null,
    arrived_at: null,
    work_tasks: [],
    completion: null,
    reschedule_preview: { is_available: false, unavailable_reason: "" },
    scope_amendments: [],
    server_now: "2026-08-04T11:30:00Z",
    next_transition_at: null,
  };
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

const booked = unit({
  status: "BOOKED",
  booking_id: "booking-1",
  booking_status: "COMPLETION_SUBMITTED",
});

describe("a one-visit booking the professional has reported done", () => {
  it("lets the customer confirm or report a problem where the booking opens", async () => {
    // The bug as reported: the Partner waited for an acknowledgement the Customer had no
    // button for, because Confirm lived only on the separate visit page.
    client.GET.mockResolvedValue(ok(visit("COMPLETION_SUBMITTED")));

    render(<SingleVisitDetailCard unit={booked} isPaid groupReadAt={0} />, { wrapper });

    expect(await screen.findByRole("button", { name: /confirm it is done/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /report a problem/i })).toBeInTheDocument();
  });

  it("draws no empty start-code box once work has started", async () => {
    client.GET.mockResolvedValue(ok(visit("COMPLETION_SUBMITTED")));

    render(<SingleVisitDetailCard unit={booked} isPaid groupReadAt={0} />, { wrapper });

    await screen.findByRole("button", { name: /confirm it is done/i });
    expect(screen.queryByText(/start code for visit/i)).not.toBeInTheDocument();
  });

  it("offers nothing to confirm before the report arrives", async () => {
    client.GET.mockResolvedValue(ok(visit("IN_PROGRESS")));

    render(
      <SingleVisitDetailCard
        unit={{ ...booked, booking_status: "IN_PROGRESS" }}
        isPaid
        groupReadAt={0}
      />,
      { wrapper },
    );

    expect(await screen.findByText(/in progress/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm it is done/i })).not.toBeInTheDocument();
  });
});
