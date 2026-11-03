import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/operations/stays",
  useSearchParams: () => new URLSearchParams(search.value),
}));

const { MoneyTab } = await import("./money-tab");
const { ServiceTabs, useServiceTab } = await import("./service-tabs");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const SUMMARY = {
  period: "this_month",
  starts_at: null,
  ends_at: null,
  model: "Hosts pay for a subscription plan to list their properties.",
  totals: [
    { key: "revenue", label: "Subscription revenue", kind: "money", value: 4990000, note: "" },
    { key: "active", label: "Hosts on a plan now", kind: "count", value: 12, note: "" },
  ],
  plans: [
    {
      id: "p1",
      name: "Basic",
      price_paise: 49900,
      duration_days: 30,
      is_active: true,
      purchases: 10,
      active_now: 8,
      revenue_paise: 499000,
    },
  ],
  listing_counts: [{ key: "total", label: "All properties", count: 40 }],
};

const PAYMENT = {
  id: "s1",
  paid_at: "2026-10-20T10:00:00Z",
  payer_name: "Lakeview Host",
  payer_phone: "+919900000001",
  item: "Basic",
  amount_paise: 49900,
  refunded_paise: 0,
  platform_paise: 49900,
  status: "ACTIVE",
};

let queryClient: QueryClient;
beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.GET.mockReset();
  router.replace.mockReset();
  search.value = "";
  client.GET.mockImplementation(async (path: string) =>
    path.endsWith("/payments") ? ok([PAYMENT]) : ok(SUMMARY),
  );
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("MoneyTab", () => {
  it("shows how the service earns, its totals, each plan and who paid", async () => {
    render(<MoneyTab service="stays" />, { wrapper });

    expect(await screen.findByText(SUMMARY.model)).toBeInTheDocument();
    const totals = screen.getByTestId("money-totals");
    expect(within(totals).getByText("Subscription revenue")).toBeInTheDocument();
    expect(within(totals).getByText("12")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Basic" })).toBeInTheDocument();
    expect(await screen.findByText("Lakeview Host")).toBeInTheDocument();
    expect(client.GET).toHaveBeenCalledWith("/api/v1/ops/stays/money", {
      params: { query: { period: "this_month" } },
    });
  });

  it("asks only for the chosen service and period", async () => {
    render(<MoneyTab service="rentals" />, { wrapper });
    await screen.findByText(SUMMARY.model);

    fireEvent.click(screen.getByRole("button", { name: "All time" }));

    await waitFor(() =>
      expect(client.GET).toHaveBeenCalledWith("/api/v1/ops/rentals/money", {
        params: { query: { period: "all" } },
      }),
    );
    expect(client.GET).not.toHaveBeenCalledWith("/api/v1/ops/stays/money", expect.anything());
  });

  it("says when nobody paid in the period", async () => {
    client.GET.mockImplementation(async (path: string) =>
      path.endsWith("/payments") ? ok([]) : ok(SUMMARY),
    );
    render(<MoneyTab service="listings" />, { wrapper });

    expect(await screen.findByText("No payments in this period.")).toBeInTheDocument();
  });
});

const TABS = [
  { key: "properties", label: "Properties" },
  { key: "money", label: "Money" },
] as const;

function Tabs() {
  const [active, setActive] = useServiceTab(TABS);
  return <ServiceTabs tabs={TABS} active={active} onChange={setActive} label="Stays sections" />;
}

describe("ServiceTabs", () => {
  it("opens on the tab named in the address", () => {
    search.value = "tab=money";
    render(<Tabs />);
    expect(screen.getByRole("tab", { name: "Money" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the chosen tab in the address", () => {
    render(<Tabs />);
    fireEvent.click(screen.getByRole("tab", { name: "Money" }));
    expect(router.replace).toHaveBeenCalledWith("/operations/stays?tab=money", { scroll: false });
  });
});
