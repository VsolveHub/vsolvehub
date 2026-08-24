import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enquiryDetail, planVisit, proposal } from "../fixtures";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
const router = { back: vi.fn(), push: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { EnquiryDetailScreen } = await import("./enquiry-detail-screen");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const slotGrid: Schemas["VisitSlotGrid"] = {
  server_now: "2026-08-21T03:30:00Z",
  visit_duration_minutes: 45,
  availability_is_preliminary: true,
  timezone: "Asia/Kolkata",
  days: [
    {
      date: "2026-08-21",
      is_today: true,
      slots: [
        {
          id: "today-slot-token",
          starts_at: "2026-08-21T03:30:00Z",
          ends_at: "2026-08-21T04:15:00Z",
          is_available: true,
          unavailable_reason: null,
        },
      ],
    },
    {
      date: "2026-08-22",
      is_today: false,
      slots: [
        {
          id: "signed-slot-token",
          starts_at: "2026-08-22T03:30:00Z",
          ends_at: "2026-08-22T04:15:00Z",
          is_available: true,
          unavailable_reason: null,
        },
        {
          id: "unavailable-slot-token",
          starts_at: "2026-08-22T04:30:00Z",
          ends_at: "2026-08-22T05:15:00Z",
          is_available: false,
          unavailable_reason: "NO_CAPACITY",
        },
      ],
    },
    {
      date: "2026-08-23",
      is_today: false,
      slots: [
        {
          id: "second-day-slot-token",
          starts_at: "2026-08-23T03:30:00Z",
          ends_at: "2026-08-23T04:15:00Z",
          is_available: true,
          unavailable_reason: null,
        },
      ],
    },
    {
      date: "2026-08-24",
      is_today: false,
      slots: [
        {
          id: "third-day-slot-token",
          starts_at: "2026-08-24T03:30:00Z",
          ends_at: "2026-08-24T04:15:00Z",
          is_available: true,
          unavailable_reason: null,
        },
      ],
    },
  ],
};

let queryClient: QueryClient;

function wrapper({ children }: { readonly children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderProject(
  status: Schemas["VendorInvitationStatusEnum"],
  visits: Schemas["SiteVisit"][] = [],
  proposals: Schemas["Proposal"][] = [],
) {
  client.GET.mockImplementation((path: string) => {
    if (path.endsWith("/visit-slots/")) return Promise.resolve(ok(slotGrid));
    if (path === "/api/v1/proposals/") {
      return Promise.resolve(ok({ results: proposals, next: null }));
    }
    return Promise.resolve(
          ok(
            enquiryDetail({
              archetype: "A5_CUSTOM_PROJECT",
              service_name: "Home renovation",
              status,
              site_visits: visits,
            }),
          ),
        );
  });

  return render(
    <EnquiryDetailScreen invitationId="11111111-1111-4111-8111-111111111111" />,
    { wrapper },
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
  router.back.mockReset();
  router.push.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("project visit entry", () => {
  it("shows the visit picker instead of a separate Accept action", async () => {
    renderProject("INVITED");

    expect(
      await screen.findByRole("heading", { name: "Book your site visit" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Home renovation" })).toBeInTheDocument();
    expect(screen.getByText("Near Kukatpally, Hyderabad")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What the customer asked for" })).toBeInTheDocument();
    expect(screen.getByText("Two floors, deep clean before a handover.")).toBeInTheDocument();
    expect(screen.queryByText("Plot 14")).not.toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: /Choose/i })).toBeInTheDocument();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /22 Aug/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /23 Aug/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /24 Aug/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/10:00/)).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup")).toHaveClass("grid-cols-2");
    expect(screen.queryByRole("button", { name: /^Accept$/i })).not.toBeInTheDocument();
  });

  it("keeps the visit picker available after the older UI already accepted", async () => {
    renderProject("ACCEPTED");

    expect(
      await screen.findByRole("heading", { name: "Book your site visit" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Confirm a visit slot first")).not.toBeInTheDocument();
  });

  it("shows the booked visit instead of offering another slot", async () => {
    renderProject("ACCEPTED", [planVisit()]);

    expect(await screen.findByRole("heading", { name: "Your visit" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Book your site visit" })).not.toBeInTheDocument();
  });

  it("shows the submitted estimate with a revise action", async () => {
    const completedVisit = planVisit({
      status: "COMPLETED",
      arrival_method: "START_OTP",
      arrival_confirmed_at: "2026-08-18T04:31:00Z",
      completed_at: "2026-08-18T05:00:00Z",
    });
    renderProject("QUOTED", [completedVisit], [
      proposal({
        total_paise: 1_000_000,
        site_visit: completedVisit.id,
        rate_paise_per_worker_day: null,
        minimum_days: null,
        worker_count: null,
      }),
    ]);

    expect(await screen.findByText("Estimate sent")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Your estimate" })).toBeInTheDocument();
    expect(screen.getByText("₹10,000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revise estimate" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Write the estimate" })).not.toBeInTheDocument();
  });
});
