import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));
vi.mock("@/features/account/view/profile-completion-dialog", () => ({
  useProfileCompletionGate: () => ({
    run: (action: () => void) => action(),
    dialog: null,
  }),
}));

const { RequestAccessPanel } = await import("./request-access-panel");

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function share(position = 0): Schemas["VisitPlanShare"] {
  return {
    id: `share-${position + 1}`,
    position,
    status: "OPEN",
    // New at 1.44.0: a share now carries its own matching state and the slot
    // the customer picked, so a partially matched plan can be rendered one
    // slot at a time instead of collapsing to a single plan-level status.
    matching_status: "SEARCHING",
    requested_start: "2026-08-24T04:30:00Z",
    duration_minutes: 120,
    amount_paise: 4950,
    vendor_payout_paise: 4000,
    platform_share_paise: 950,
    settlement_reason_code: "",
    committed_at: null,
    earned_at: null,
    refunded_at: null,
  };
}

function plan(overrides: Partial<Schemas["VisitPlan"]> = {}): Schemas["VisitPlan"] {
  return {
    id: "plan-1",
    status: "CHOSEN",
    plan_size: 2,
    price_paise: 9900,
    credit_paise: 0,
    chargeable_paise: 9900,
    payment_attempt_id: null,
    simulated_capture_available: false,
    shares: [share(0), share(1)],
    receipt_series: "",
    receipt_sequence: null,
    fill_due_at: null,
    chosen_at: "2026-08-16T10:00:00.000Z",
    charged_at: null,
    settled_at: null,
    ...overrides,
  };
}

function visitPlanState(
  overrides: Partial<Schemas["VisitPlanState"]> = {},
): Schemas["VisitPlanState"] {
  return {
    plan: plan(),
    available_tiers: [],
    visits: [],
    checkout_available: true,
    can_read_full_estimates: false,
    server_now: "2026-08-16T10:05:00.000Z",
    ...overrides,
  };
}

const checkout: Schemas["AccessCheckout"] = {
  payment_attempt_id: "attempt-1",
  amount_paise: 9900,
  currency: "INR",
  provider: "fake",
  provider_order_id: "fake_order_attempt_1",
  status: "CREATED",
  expires_at: null,
  server_now: "2026-08-16T10:05:00.000Z",
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderPanel() {
  return render(
    <RequestAccessPanel
      requirementId="req-1"
      archetype="A5_CUSTOM_PROJECT"
      quotesHref="/requests/req-1/quotes"
      bookCrewFeeHref="/requests/req-1/book-crew"
      slot="rail"
    />,
    { wrapper },
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("request-detail visit payment", () => {
  it("opens the payment breakdown in place instead of navigating", async () => {
    client.GET.mockResolvedValue(ok(visitPlanState()));
    renderPanel();

    const payButton = await screen.findByRole("button", {
      name: "Pay ₹99 and lock the visits",
    });
    expect(payButton.closest("a")).toBeNull();

    fireEvent.click(payButton);

    expect(await screen.findByRole("dialog", { name: "Pay for the visits" })).toBeInTheDocument();
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("starts checkout and captures a fake-provider payment after confirmation", async () => {
    client.GET.mockResolvedValue(ok(visitPlanState()));
    client.POST.mockImplementation((path: string) => {
      if (path === "/api/v1/requirements/{requirement_id}/visit-plan/checkout/") {
        return Promise.resolve(ok(checkout, 201));
      }
      if (path === "/api/v1/payment-attempts/{attempt_id}/simulate-capture/") {
        return Promise.resolve(ok({}));
      }
      return Promise.resolve(ok({}));
    });
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Pay ₹99 and lock the visits" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Pay for the visits" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Pay ₹99" }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/payment-attempts/{attempt_id}/simulate-capture/",
        { params: { path: { attempt_id: "attempt-1" } } },
      ),
    );
  });

  it("shows the server-provided share for every visit", async () => {
    client.GET.mockResolvedValue(ok(visitPlanState()));
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Pay ₹99 and lock the visits" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Pay for the visits" });

    expect(within(dialog).getAllByText("₹49.50")).toHaveLength(2);
    expect(within(dialog).getAllByText(/Time not offered yet/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/refunds on its own/)).toBeInTheDocument();
  });

  it("keeps an already-pending fake payment recoverable on the request page", async () => {
    client.GET.mockResolvedValue(
      ok(
        visitPlanState({
          plan: plan({
            status: "PENDING",
            payment_attempt_id: "attempt-1",
            simulated_capture_available: true,
          }),
          checkout_available: false,
        }),
      ),
    );
    client.POST.mockResolvedValue(ok({}));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Mark as paid" }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/payment-attempts/{attempt_id}/simulate-capture/",
        { params: { path: { attempt_id: "attempt-1" } } },
      ),
    );
  });
});

function scheduledVisit(id: string): Schemas["SiteVisit"] {
  return {
    id,
    status: "SCHEDULED",
    is_plan_visit: true,
    timezone: "Asia/Kolkata",
    vendor: {
      display_name: "M2 Demo Vendor 1",
      business_type: "INDIVIDUAL",
      is_verified: true,
      experience_years: 6,
      photo_url: null,
    },
    fee_paise: 4950,
    adjusts_against_final_price: true,
    scheduled_for: "2026-09-04T02:30:00.000Z",
    duration_minutes: 60,
    arrival_confirmed_at: null,
    arrival_method: "START_OTP",
    completed_at: null,
    estimate_due_at: null,
    cancellation_reason_code: "",
  };
}

function bookedShare(position: number): Schemas["VisitPlanShare"] {
  return {
    ...share(position),
    status: "COMMITTED",
    matching_status: "BOOKED",
    committed_at: "2026-08-21T08:00:00.000Z",
  };
}

function mockVisitReads(state: Schemas["VisitPlanState"]) {
  client.GET.mockImplementation((path: string) => {
    if (path === "/api/v1/requirements/{requirement_id}/visit-plan/") {
      return Promise.resolve(ok(state));
    }
    if (path === "/api/v1/site-visits/{site_visit_id}/arrival-code/") {
      return Promise.resolve(
        ok<Schemas["VisitArrivalCode"]>({
          code: "482916",
          expires_at: "2026-09-04T02:45:00.000Z",
          can_issue: true,
          server_now: "2026-09-01T08:00:00.000Z",
        }),
      );
    }
    if (path === "/api/v1/requirements/{requirement_id}/quotes/") {
      return Promise.resolve(
        ok<Schemas["CustomerQuoteList"]>({
          quotes: [],
          non_responsive_rejections_remaining: null,
          server_now: "2026-09-01T08:00:00.000Z",
        }),
      );
    }
    return Promise.reject(new Error(`Unexpected GET ${path}`));
  });
}

function renderTracker(slot: "main" | "rail") {
  return render(
    <RequestAccessPanel
      requirementId="req-1"
      archetype="A5_CUSTOM_PROJECT"
      quotesHref="/requests/req-1/quotes"
      bookCrewFeeHref="/requests/req-1/book-crew"
      slot={slot}
    />,
    { wrapper },
  );
}

describe("request-detail single visit", () => {
  it("inlines the visit on the request when there is only one booked visit", async () => {
    mockVisitReads(
      visitPlanState({
        plan: plan({
          status: "ACTIVE",
          plan_size: 1,
          price_paise: 4950,
          chargeable_paise: 4950,
          shares: [bookedShare(1)],
          charged_at: "2026-08-21T07:30:00.000Z",
        }),
        visits: [scheduledVisit("visit-1")],
        checkout_available: false,
        can_read_full_estimates: true,
      }),
    );

    renderTracker("main");

    expect(await screen.findByRole("heading", { name: "Who is coming" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What happens" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Arrival code" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Held for this visit" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "See every visit at a glance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open this visit/i })).not.toBeInTheDocument();
  });

  it("keeps the glance list when two visits are booked", async () => {
    mockVisitReads(
      visitPlanState({
        plan: plan({
          status: "ACTIVE",
          shares: [bookedShare(1), bookedShare(2)],
          charged_at: "2026-08-21T07:30:00.000Z",
        }),
        visits: [scheduledVisit("visit-1"), scheduledVisit("visit-2")],
        checkout_available: false,
        can_read_full_estimates: true,
      }),
    );

    renderTracker("main");

    expect(
      await screen.findByRole("heading", { name: "See every visit at a glance" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /open this visit/i })).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Who is coming" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Arrival code" })).not.toBeInTheDocument();
  });
});
