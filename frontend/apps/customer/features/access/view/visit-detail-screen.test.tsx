import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { VisitDetailScreen } = await import("./visit-detail-screen");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const baseState: Schemas["VisitPlanState"] = {
  plan: {
    id: "plan-1",
    status: "ACTIVE",
    plan_size: 1,
    price_paise: 4950,
    credit_paise: 0,
    chargeable_paise: 4950,
    payment_attempt_id: "payment-1",
    simulated_capture_available: false,
    shares: [
      {
        id: "share-1",
        position: 1,
        status: "COMMITTED",
    // New at 1.44.0: a share now carries its own matching state and the slot
    // the customer picked, so a partially matched plan can be rendered one
    // slot at a time instead of collapsing to a single plan-level status.
    matching_status: "BOOKED",
    requested_start: "2026-08-24T04:30:00Z",
    duration_minutes: 120,
        amount_paise: 4950,
        vendor_payout_paise: 4000,
        platform_share_paise: 950,
        settlement_reason_code: "",
        committed_at: "2026-08-21T08:00:00.000Z",
        earned_at: null,
        refunded_at: null,
      },
    ],
    receipt_series: "VS",
    receipt_sequence: 1,
    fill_due_at: null,
    chosen_at: "2026-08-21T07:00:00.000Z",
    charged_at: "2026-08-21T07:30:00.000Z",
    settled_at: null,
  },
  available_tiers: [],
  visits: [
    {
      id: "visit-1",
      status: "SCHEDULED",
      is_plan_visit: true,
      timezone: "Asia/Kolkata",
      vendor: {
        display_name: "Anil Kumar",
        business_type: "Professional",
        is_verified: true,
        experience_years: 5,
        photo_url: null,
      },
      fee_paise: 4950,
      adjusts_against_final_price: true,
      scheduled_for: "2026-08-22T05:30:00.000Z",
      duration_minutes: 60,
      arrival_confirmed_at: null,
      arrival_method: "START_OTP",
      completed_at: null,
      estimate_due_at: null,
      cancellation_reason_code: "",
    },
  ],
  checkout_available: false,
  can_read_full_estimates: false,
  server_now: "2026-08-21T08:00:00.000Z",
};

let queryClient: QueryClient;
let visitPlanState: Schemas["VisitPlanState"];
let quoteList: Schemas["CustomerQuoteList"];

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  visitPlanState = baseState;
  quoteList = {
    quotes: [],
    non_responsive_rejections_remaining: null,
    server_now: "2026-08-21T08:00:00.000Z",
  };
  for (const method of Object.values(client)) method.mockReset();
  client.GET.mockImplementation((path: string) => {
    if (path === "/api/v1/requirements/{requirement_id}/visit-plan/") {
      return Promise.resolve(ok(visitPlanState));
    }
    if (path === "/api/v1/site-visits/{site_visit_id}/arrival-code/") {
      return Promise.resolve(
        ok<Schemas["VisitArrivalCode"]>({
          code: "482916",
          expires_at: "2026-08-21T08:15:00.000Z",
          can_issue: true,
          server_now: "2026-08-21T08:00:00.000Z",
        }),
      );
    }
    if (path === "/api/v1/requirements/{requirement_id}/quotes/") {
      return Promise.resolve(ok(quoteList));
    }
    return Promise.reject(new Error(`Unexpected GET ${path}`));
  });
});

afterEach(() => {
  queryClient.clear();
});

describe("customer visit arrival", () => {
  it("shows the mandatory arrival code without a no-code bypass", async () => {
    render(
      <VisitDetailScreen requirementId="requirement-1" siteVisitId="visit-1" />,
      { wrapper },
    );

    expect(await screen.findByRole("heading", { name: "Arrival code" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /arrived without using the code/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show code/i }));
    expect(screen.getByText("482916")).toBeInTheDocument();
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("shows the estimate created by this professional on this visit", async () => {
    const completedVisit: Schemas["SiteVisit"] = {
      ...baseState.visits[0]!,
      status: "COMPLETED",
      completed_at: "2026-08-21T09:00:00.000Z",
      estimate_due_at: "2026-08-22T09:00:00.000Z",
    };
    visitPlanState = {
      ...baseState,
      visits: [completedVisit],
      can_read_full_estimates: true,
    };
    quoteList = {
      quotes: [
        {
          id: "proposal-1",
          status: "SUBMITTED",
          usability: "USABLE",
          rejection_reason: "NOT_CHOSEN",
          revision: 2,
          revalidation_requested_at: null,
      revision_request: null,
      questions: [],
      completion_days: null,
    scope_summary: "",
          vendor: {
            partner_id: "partner-1",
            vendor_type: "AGENCY",
            is_verified: true,
            display_name: "M2 Demo Vendor 2 Services LLP",
          },
          site_visit: completedVisit,
          rate_paise_per_worker_day: null,
          minimum_days: null,
          worker_count: null,
          // New at 1.44.0: the estimate shape and the server-calculated money
          // the client is no longer allowed to derive for itself.
          estimate_type: "ITEM_WISE",
          item_lines: [],
          labour_lines: [],
          other_charges: [],
          calculation_snapshot: null,
          line_subtotal_paise: 0,
          authorized_charges_paise: 0,
          taxable_value_paise: 0,
          partner_quote_total_paise: 0,
          platform_fee_paise: 0,
          platform_fee_tax_paise: 0,
          customer_total_paise: 0,
          discount_kind: null,
          discount_bps: null,
          discount_base_paise: 1_000_000,
          discount_paise: 0,
          discount_source: null,
          total_paise: 1_000_000,
          tax_paise: 0,
          tax_basis: "INCLUSIVE",
          inclusions: [],
          exclusions: [],
          stages: [],
          material_lines: [],
          material_list: [],
          material_brand_tier: "",
          material_fulfilment_mode: "CUSTOMER_PROCURES",
          included_supply_list: [],
          warranty_terms: "",
          valid_until: null,
          submitted_at: "2026-08-21T09:30:00.000Z",
        },
      ],
      non_responsive_rejections_remaining: null,
      server_now: "2026-08-21T10:00:00.000Z",
    };

    render(
      <VisitDetailScreen requirementId="requirement-1" siteVisitId="visit-1" />,
      { wrapper },
    );

    expect(await screen.findByRole("heading", { name: "M2 Demo Vendor 2 Services LLP" }))
      .toBeInTheDocument();
    expect(screen.getByText("₹10,000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read this estimate in full" })).toHaveAttribute(
      "href",
      "/requests/requirement-1/quotes/proposal-1",
    );
  });
});
