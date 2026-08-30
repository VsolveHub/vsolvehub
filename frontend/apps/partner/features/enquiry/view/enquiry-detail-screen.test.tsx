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
          // A fixed-time offer (1.44.0): the customer already chose the slot.
          fixed_visit_start: "2026-08-22T04:30:00Z",
          fixed_visit_duration_minutes: 120,
          fixed_visit_earning_paise: 14_900,
          fixed_visit_status: "OFFERED",
          brief: [{ code: "symptom", question: "What is wrong", value: "Power keeps tripping" }],
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
  it("shows the fixed-time offer as tiles, with take and pass and no picker", async () => {
    renderProject("INVITED");

    expect(await screen.findByRole("button", { name: "Take this visit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pass on this one" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Home renovation" })).toBeInTheDocument();
    expect(screen.getByText("Near Kukatpally, Hyderabad")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What the customer asked for" })).toBeInTheDocument();
    // The brief, as labelled — not the raw answer map.
    expect(screen.getByText("Power keeps tripping")).toBeInTheDocument();
    expect(screen.queryByText("Site access")).not.toBeInTheDocument();
    expect(screen.queryByText("Plot 14")).not.toBeInTheDocument();
    expect(screen.getByText("Service")).toBeInTheDocument();
    expect(screen.getByText("Area")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Starts")).toBeInTheDocument();
    expect(screen.getByText("₹149")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Choose/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Accept$/i })).not.toBeInTheDocument();
  });

  it("keeps the offer answerable after the older UI already accepted", async () => {
    renderProject("ACCEPTED");

    expect(await screen.findByRole("button", { name: "Take this visit" })).toBeInTheDocument();
  });

  it("shows the booked visit instead of the offer", async () => {
    renderProject("ACCEPTED", [planVisit()]);

    expect(await screen.findByRole("heading", { name: "Your visit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take this visit" })).not.toBeInTheDocument();
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
