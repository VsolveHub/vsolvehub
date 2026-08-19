import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { BookVisitsScreen } = await import("./book-visits-screen");

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function share(position = 0): Schemas["VisitPlanShare"] {
  return {
    id: `share-${position + 1}`,
    position,
    status: "OPEN",
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

describe("BookVisitsScreen development payment", () => {
  it("marks an already-pending fake visit-plan payment as paid", async () => {
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

    render(<BookVisitsScreen requirementId="req-1" requestHref="/requests/req-1" />, {
      wrapper,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Mark as paid" }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/payment-attempts/{attempt_id}/simulate-capture/",
        { params: { path: { attempt_id: "attempt-1" } } },
      ),
    );
  });

  it("starts checkout and immediately captures a fake-provider visit-plan payment", async () => {
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

    render(<BookVisitsScreen requirementId="req-1" requestHref="/requests/req-1" />, {
      wrapper,
    });

    // The page control opens the confirm dialog; it does not charge. The dialog
    // is where the per-visit split is shown and where the money actually starts.
    fireEvent.click(
      await screen.findByRole("button", { name: "Pay ₹99 and lock the visits" }),
    );
    expect(client.POST).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Pay ₹99" }));

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/payment-attempts/{attempt_id}/simulate-capture/",
        { params: { path: { attempt_id: "attempt-1" } } },
      ),
    );
  });

  it("shows which slot each half of the money is for", async () => {
    client.GET.mockResolvedValue(ok(visitPlanState()));
    render(<BookVisitsScreen requirementId="req-1" requestHref="/requests/req-1" />, {
      wrapper,
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Pay ₹99 and lock the visits" }),
    );
    const dialog = await screen.findByRole("dialog");

    // Each share's own `amount_paise`, not the plan price divided by the slot
    // count — and the unfilled slot says so, beside the refund rule that applies
    // to it. This is the question somebody paying for two visits with one time
    // confirmed actually has.
    expect(within(dialog).getAllByText("₹49.50")).toHaveLength(2);
    expect(within(dialog).getAllByText(/Time not offered yet/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/refunds on its own/)).toBeInTheDocument();
  });

  it("cancels without charging", async () => {
    client.GET.mockResolvedValue(ok(visitPlanState()));
    render(<BookVisitsScreen requirementId="req-1" requestHref="/requests/req-1" />, {
      wrapper,
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Pay ₹99 and lock the visits" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Not now" }));

    expect(client.POST).not.toHaveBeenCalled();
  });
});
