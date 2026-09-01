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

/** Far enough ahead that no test run drifts into the visit's own day. */
function farFuture(): string {
  return new Date(Date.now() + 30 * 86_400_000).toISOString();
}

/** What the server discloses once a paid visit is scheduled. */
const DISCLOSED_ADDRESS: Schemas["PartnerSiteAddress"] = {
  line1: "Plot 14",
  line2: "Second floor",
  landmark: "Metro station",
  locality: "Kukatpally",
  city: "Hyderabad",
  state: "Telangana",
  postal_code: "500072",
};

function renderProject(
  status: Schemas["VendorInvitationStatusEnum"],
  visits: Schemas["SiteVisit"][] = [],
  proposals: Schemas["Proposal"][] = [],
  disclosed: Partial<Schemas["EnquiryDetail"]> = {},
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
          ...disclosed,
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
    // Settle on the amount first: it only exists once the proposals read has
    // resolved into the known branch. Grabbing the heading earlier races the
    // loading branch's identical heading, which detaches on that re-render.
    expect(await screen.findByText("₹10,000")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your estimate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revise estimate" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Write the estimate" })).not.toBeInTheDocument();
  });
});

/**
 * The layout is `Now → Where → Who → What they asked for`, and the one action
 * this visit is waiting on is pinned in a bar of its own rather than parked at
 * the bottom of the third card.
 */
describe("the visit-day layout", () => {
  it("puts the visit first, then the address, then the customer, then the brief", async () => {
    renderProject("ACCEPTED", [planVisit({ scheduled_for: farFuture() })], [], {
      site_address: DISCLOSED_ADDRESS,
      customer_name: "Anthapu",
    });

    await screen.findByRole("heading", { name: "Your visit" });

    const order = [
      screen.getByRole("heading", { name: "Your visit" }),
      screen.getByRole("heading", { name: "Site address" }),
      screen.getByRole("heading", { name: "Visiting" }),
      screen.getByText("What the customer asked for"),
    ];

    for (let i = 1; i < order.length; i += 1) {
      const previous = order[i - 1];
      const next = order[i];
      if (previous === undefined || next === undefined) throw new Error("missing landmark");
      // Node.DOCUMENT_POSITION_FOLLOWING — each landmark comes after the last.
      expect(previous.compareDocumentPosition(next) & 4).toBeTruthy();
    }
  });

  /**
   * The defect: the exact address was disclosed on this screen while
   * `approximateArea` was still printed in the header above it, so the vaguer
   * copy won the larger type and said the same thing first.
   */
  it("stops repeating the locality once the exact address is disclosed", async () => {
    renderProject("ACCEPTED", [planVisit({ scheduled_for: farFuture() })], [], {
      site_address: DISCLOSED_ADDRESS,
    });

    await screen.findByRole("heading", { name: "Site address" });
    expect(screen.queryByText("Near Kukatpally, Hyderabad")).not.toBeInTheDocument();
  });

  /**
   * The defect: `fixed_visit_earning_paise` rendered only on a held slot, so
   * the moment the visit was confirmed a vendor could no longer see what
   * travelling to it was worth.
   */
  it("keeps what the visit pays on screen once it is booked", async () => {
    renderProject("ACCEPTED", [planVisit({ scheduled_for: farFuture() })]);

    await screen.findByRole("heading", { name: "Your visit" });
    expect(screen.getByText("₹149")).toBeInTheDocument();
    expect(screen.getByText("for this visit")).toBeInTheDocument();
  });

  /** The same figure at three sizes on one screen reads as three figures. */
  it("leaves the amount to the offer card while the offer is still being decided", async () => {
    renderProject("INVITED");

    await screen.findByRole("button", { name: "Take this visit" });
    expect(screen.queryByText("for this visit")).not.toBeInTheDocument();
  });

  /**
   * The server closes its address window when the visit completes, so
   * `site_address` goes back to null. Rendering `SiteAddress`'s locked branch
   * then tells a vendor who has just left the building not to travel yet.
   */
  it("drops the address card rather than showing pre-payment copy after the visit", async () => {
    renderProject("ACCEPTED", [
      planVisit({
        status: "COMPLETED",
        arrival_confirmed_at: "2026-08-18T04:31:00Z",
        completed_at: "2026-08-18T05:00:00Z",
      }),
    ]);

    await screen.findByRole("heading", { name: "Your visit" });
    expect(screen.queryByText(/Do not travel while this visit is on hold/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Visit location" })).not.toBeInTheDocument();
  });
});

describe("a closed enquiry", () => {
  it("says which kind of closed it is, and offers the way out", async () => {
    renderProject("EXPIRED");

    expect(await screen.findByText("Time ran out")).toBeInTheDocument();
    // `meaning` used to be screen-reader-only, which left a grey barred circle
    // as the only visible difference between expiry and a decline.
    expect(screen.getByText(/response window closed before you answered/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Work" })).toHaveAttribute(
      "href",
      "/work/all",
    );
  });
});
