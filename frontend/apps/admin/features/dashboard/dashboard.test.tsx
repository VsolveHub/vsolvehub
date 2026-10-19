import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hrefForMetric, METRIC_KEY_HREF, DashboardView as KindDashboardView } from "./kind-dashboard";
import { DashboardPinStrip } from "./pin-strip";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.GET.mockImplementation((path: string) => {
    if (path.includes("/api/v1/ops/dashboard-preferences/")) {
      return Promise.resolve({
        data: { pinned_tiles: ["open_cases", "active_rentals", "active_stays", "active_partners", "payout_ready", "collected_gmv_paise"] },
        response: new Response(null, { status: 200 }),
      });
    }
    if (path.includes("/api/v1/ops/dashboards/overview")) {
      return Promise.resolve({
        data: {
          open_cases: 5,
          active_rentals: 8,
          active_stays: 12,
          active_partners: 24,
          payout_ready: 3,
          collected_gmv_paise: 5000000,
        },
        response: new Response(null, { status: 200 }),
      });
    }
    if (path.includes("/api/v1/ops/dashboards/booking")) {
      return Promise.resolve({
        data: {
          status_breakdown: { COMPLETED: 6, CANCELLED: 2, DISPUTED: 1, CONFIRMED: 1 },
          completed_bookings: 6,
        },
        response: new Response(null, { status: 200 }),
      });
    }
    if (path.includes("/api/v1/ops/dashboards/customer")) {
      return Promise.resolve({
        data: {
          new_signups: 3,
          series_granularity: "day",
          series: [
            { date: "2026-10-01", new_signups: 1 },
            { date: "2026-10-02", new_signups: 2 },
          ],
        },
        response: new Response(null, { status: 200 }),
      });
    }
    if (path.includes("/api/v1/ops/dashboards/categories")) {
      return Promise.resolve({
        data: {
          categories: {
            "Equipment Rentals": { bookings: 10, revenue_paise: 200000 },
            "Rooms / PG / Hotels": { bookings: 15, revenue_paise: 450000 },
            "Home Cleaning": { bookings: 20, revenue_paise: 150000 },
          },
        },
        response: new Response(null, { status: 200 }),
      });
    }
    return Promise.resolve({ data: {}, response: new Response(null, { status: 200 }) });
  });
});

afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

describe("hrefForMetric and METRIC_KEY_HREF route coverage", () => {
  it("covers cases routes", () => {
    expect(hrefForMetric("", "cases")).toBe("/operations/cases");
    expect(hrefForMetric("", "case")).toBe("/operations/cases");
    expect(hrefForMetric("", "open_cases")).toBe("/operations/cases");
    expect(hrefForMetric("", "cases_open")).toBe("/operations/cases");
    expect(hrefForMetric("", "disputed_bookings")).toBe("/operations/cases");
    expect(hrefForMetric("", "breaching_sla")).toBe("/operations/cases");
    expect(hrefForMetric("", "mine_open")).toBe("/operations/cases");
    expect(hrefForMetric("", "unclaimed_cases")).toBe("/operations/cases");
    expect(hrefForMetric("cases", "any_metric")).toBe("/operations/cases");
    expect(METRIC_KEY_HREF.open_cases).toBe("/operations/cases");
  });

  it("covers rentals routes", () => {
    expect(hrefForMetric("", "rentals")).toBe("/operations/rentals");
    expect(hrefForMetric("", "rental")).toBe("/operations/rentals");
    expect(hrefForMetric("", "active_rentals")).toBe("/operations/rentals");
    expect(hrefForMetric("", "rental_bookings")).toBe("/operations/rentals");
    expect(hrefForMetric("", "equipment_rentals")).toBe("/operations/rentals");
    expect(hrefForMetric("", "Equipment Rentals")).toBe("/operations/rentals");
    expect(hrefForMetric("rentals", "summary")).toBe("/operations/rentals");
    expect(METRIC_KEY_HREF.active_rentals).toBe("/operations/rentals");
  });

  it("covers stays routes", () => {
    expect(hrefForMetric("", "stays")).toBe("/operations/stays");
    expect(hrefForMetric("", "stay")).toBe("/operations/stays");
    expect(hrefForMetric("", "active_stays")).toBe("/operations/stays");
    expect(hrefForMetric("", "stay_bookings")).toBe("/operations/stays");
    expect(hrefForMetric("", "properties")).toBe("/operations/stays");
    expect(hrefForMetric("", "property")).toBe("/operations/stays");
    expect(hrefForMetric("", "Rooms / PG / Hotels")).toBe("/operations/stays");
    expect(hrefForMetric("", "rooms_pg_hotels")).toBe("/operations/stays");
    expect(hrefForMetric("stays", "summary")).toBe("/operations/stays");
    expect(METRIC_KEY_HREF.active_stays).toBe("/operations/stays");
  });

  it("covers partners routes", () => {
    expect(hrefForMetric("", "partners")).toBe("/operations/partners");
    expect(hrefForMetric("", "partner")).toBe("/operations/partners");
    expect(hrefForMetric("", "active_partners")).toBe("/operations/partners");
    expect(hrefForMetric("", "pending_kyc")).toBe("/operations/partners");
    expect(hrefForMetric("", "kyc_pending")).toBe("/operations/partners");
    expect(hrefForMetric("", "partner_review_stats")).toBe("/operations/partners");
    expect(hrefForMetric("partners", "summary")).toBe("/operations/partners");
    expect(hrefForMetric("vendor", "stats")).toBe("/operations/partners");
    expect(METRIC_KEY_HREF.active_partners).toBe("/operations/partners");
  });

  it("covers payouts routes", () => {
    expect(hrefForMetric("", "payouts")).toBe("/operations/payouts");
    expect(hrefForMetric("", "payout")).toBe("/operations/payouts");
    expect(hrefForMetric("", "payout_ready")).toBe("/operations/payouts");
    expect(hrefForMetric("", "pending_payouts")).toBe("/operations/payouts");
    expect(hrefForMetric("", "payouts_ready")).toBe("/operations/payouts");
    expect(hrefForMetric("", "partner_payouts")).toBe("/operations/payouts");
    expect(hrefForMetric("payouts", "summary")).toBe("/operations/payouts");
    expect(METRIC_KEY_HREF.payout_ready).toBe("/operations/payouts");
  });

  it("covers reports routes", () => {
    expect(hrefForMetric("", "reports")).toBe("/operations/reports");
    expect(hrefForMetric("", "report")).toBe("/operations/reports");
    expect(hrefForMetric("", "completed_bookings")).toBe("/operations/reports");
    expect(hrefForMetric("", "collected_gmv_paise")).toBe("/operations/reports");
    expect(hrefForMetric("", "revenue_paise")).toBe("/operations/reports");
    expect(hrefForMetric("", "gmv")).toBe("/operations/reports");
    expect(hrefForMetric("overview", "collected_gmv_paise")).toBe("/operations/reports");
    expect(METRIC_KEY_HREF.collected_gmv_paise).toBe("/operations/reports");
  });
});

describe("DashboardPinStrip KPI tile Links", () => {
  it("renders pinned KPI tiles as Links with correct hrefs", async () => {
    render(<DashboardPinStrip />, { wrapper });

    const openCasesLink = await screen.findByRole("link", { name: /open cases/i });
    expect(openCasesLink).toHaveAttribute("href", "/operations/cases");

    const activeRentalsLink = await screen.findByRole("link", { name: /active rentals/i });
    expect(activeRentalsLink).toHaveAttribute("href", "/operations/rentals");

    const activeStaysLink = await screen.findByRole("link", { name: /active stays/i });
    expect(activeStaysLink).toHaveAttribute("href", "/operations/stays");

    const activePartnersLink = await screen.findByRole("link", { name: /active partners/i });
    expect(activePartnersLink).toHaveAttribute("href", "/operations/partners");

    const payoutReadyLink = await screen.findByRole("link", { name: /payout ready/i });
    expect(payoutReadyLink).toHaveAttribute("href", "/operations/payouts");

    const gmvLink = await screen.findByRole("link", { name: /collected gmv/i });
    expect(gmvLink).toHaveAttribute("href", "/operations/reports");
  });
});

describe("Kind-Dashboard KPI tiles and table links", () => {
  it("renders primitive aggregate KPI tiles as Links", async () => {
    render(<KindDashboardView kind="overview" />, { wrapper });

    const casesLink = await screen.findByRole("link", { name: /open cases/i });
    expect(casesLink).toHaveAttribute("href", "/operations/cases");

    const rentalsLink = await screen.findByRole("link", { name: /active rentals/i });
    expect(rentalsLink).toHaveAttribute("href", "/operations/rentals");

    const staysLink = await screen.findByRole("link", { name: /active stays/i });
    expect(staysLink).toHaveAttribute("href", "/operations/stays");

    const partnersLink = await screen.findByRole("link", { name: /active partners/i });
    expect(partnersLink).toHaveAttribute("href", "/operations/partners");

    const payoutsLink = await screen.findByRole("link", { name: /payout ready/i });
    expect(payoutsLink).toHaveAttribute("href", "/operations/payouts");

    const gmvLink = await screen.findByRole("link", { name: /collected gmv/i });
    expect(gmvLink).toHaveAttribute("href", "/operations/reports");
  });

  it("renders category breakdown table rows with correct console links", async () => {
    render(<KindDashboardView kind="categories" />, { wrapper });

    const equipmentRentalsLink = await screen.findByRole("link", { name: /equipment rentals/i });
    expect(equipmentRentalsLink).toHaveAttribute("href", "/operations/rentals");

    const roomsStaysLink = await screen.findByRole("link", { name: /rooms \/ pg \/ hotels/i });
    expect(roomsStaysLink).toHaveAttribute("href", "/operations/stays");
  });
});

describe("Kind-Dashboard charts", () => {
  it("draws the signup trend and keeps the series out of the tiles", async () => {
    render(<KindDashboardView kind="customer" />, { wrapper });

    expect(await screen.findByRole("heading", { name: "New signups" })).toBeInTheDocument();
    expect(screen.getByText("Per day, last 30 days")).toBeInTheDocument();
    expect(screen.queryByText(/series/i)).not.toBeInTheDocument();
  });

  it("groups booking outcomes into a labelled donut", async () => {
    render(<KindDashboardView kind="booking" />, { wrapper });

    const donut = await screen.findByRole("img", { name: /how bookings ended up/i });
    expect(donut).toHaveAccessibleName(/Completed: 6 \(60%\)/);
    expect(donut).toHaveAccessibleName(/Disputed or in recovery: 1 \(10%\)/);
    expect(donut).toHaveAccessibleName(/Cancelled or aborted: 2 \(20%\)/);
  });

  it("ranks categories by revenue", async () => {
    render(<KindDashboardView kind="categories" />, { wrapper });

    const heading = await screen.findByRole("heading", { name: "Revenue by category" });
    const items = within(heading.closest("section")!).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Rooms / PG / Hotels");
    expect(items[0]).toHaveTextContent("₹4,500");
  });
});
