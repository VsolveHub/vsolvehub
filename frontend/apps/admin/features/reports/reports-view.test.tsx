import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ToastProvider } from "@vsolve/ui";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const address = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/operations/reports",
  useSearchParams: () => new URLSearchParams(address.search),
}));

const { ReportsView, statusTone } = await import("./reports-view");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const CATALOG = [
  {
    id: "bookings",
    name: "Bookings",
    group: "Services",
    description: "Home-service visits: who booked, which service, the partner and the order value.",
    filters: [
      { key: "date_start", label: "From", kind: "date", options: [] },
      { key: "date_end", label: "To", kind: "date", options: [] },
      {
        key: "service",
        label: "Service",
        kind: "choice",
        options: Array.from({ length: 20 }, (_, i) => ({
          value: `svc-${i}`,
          label: i === 3 ? "Tap Repair & Leakage" : `Service ${i}`,
          group: i < 10 ? "Plumbing" : "Electrical",
        })),
      },
      {
        key: "status",
        label: "Status",
        kind: "choice",
        options: [
          { value: "CONFIRMED", label: "Confirmed", group: "" },
          { value: "IN_PROGRESS", label: "In progress", group: "" },
        ],
      },
      { key: "partner", label: "Partner", kind: "partner", options: [] },
    ],
    columns: [],
  },
  {
    id: "payments",
    name: "Payments",
    group: "Money",
    description: "Every payment attempt.",
    filters: [],
    columns: [],
  },
];

const PREVIEW = {
  report_id: "bookings",
  name: "Bookings",
  columns: [
    { key: "reference", label: "Reference", kind: "ref", sortable: false },
    { key: "partner", label: "Partner", kind: "text", sortable: false },
    { key: "status", label: "Status", kind: "status", sortable: true },
    { key: "order_total_paise", label: "Order total", kind: "money", sortable: true },
  ],
  totals: [{ key: "count", label: "Bookings", kind: "number", value: 1 }],
  rows: [
    {
      id: "6779f873-0000",
      reference: "6779F873",
      partner: "Demo Partner · +919505410010",
      status: "Confirmed",
      order_total_paise: 15800,
    },
  ],
  total_rows_count: 1,
  offset: 0,
  limit: 50,
  export_row_limit: 5000,
};

let queryClient: QueryClient;
beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.GET.mockReset();
  router.replace.mockReset();
  address.search = "";
  client.GET.mockImplementation(async (path: string) => {
    if (path === "/api/v1/ops/reports/") return ok(CATALOG);
    if (path === "/api/v1/ops/reports/presets/") return ok([]);
    if (path === "/api/v1/ops/reports/partner-options/") return ok([]);
    return ok(PREVIEW);
  });
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("ReportsView", () => {
  it("offers dropdowns in plain words and no archetype", async () => {
    render(<ReportsView />, { wrapper });

    const status = await screen.findByLabelText("Status");
    expect(within(status).getByRole("option", { name: "In progress" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Service" })).toBeInTheDocument();
    expect(screen.queryByText(/archetype/i)).not.toBeInTheDocument();
  });

  it("shows readable rows: a reference, a name, a status label and rupees", async () => {
    render(<ReportsView />, { wrapper });

    expect(await screen.findByText("Demo Partner · +919505410010")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /6779F873/ })).toBeInTheDocument();
    // In the table, not the Status dropdown's option of the same name.
    expect(within(screen.getByRole("table")).getByText("Confirmed")).toBeInTheDocument();
    expect(screen.queryByText(/MASK/)).not.toBeInTheDocument();
  });

  it("opens on this month and asks the server for it", async () => {
    render(<ReportsView />, { wrapper });
    await screen.findByText("Demo Partner · +919505410010");

    expect(screen.getByRole("button", { name: "This month" })).toHaveAttribute("aria-pressed", "true");
    const call = client.GET.mock.calls.find(([path]) => path === "/api/v1/ops/reports/{report_id}/");
    expect(call?.[1].params.query.date_start).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("keeps a chosen status in the address", async () => {
    render(<ReportsView />, { wrapper });

    fireEvent.change(await screen.findByLabelText("Status"), { target: { value: "IN_PROGRESS" } });

    const [url] = router.replace.mock.calls.at(-1) ?? [];
    expect(url).toContain("report=bookings");
    expect(url).toContain("status=IN_PROGRESS");
  });

  it("finds a service by typing part of its name", async () => {
    render(<ReportsView />, { wrapper });
    const service = await screen.findByRole("combobox", { name: "Service" });

    fireEvent.focus(service);
    fireEvent.change(service, { target: { value: "tap" } });
    fireEvent.click(screen.getByRole("option", { name: "Tap Repair & Leakage" }));

    expect(router.replace.mock.calls.at(-1)?.[0]).toContain("service=svc-3");
  });

  it("groups reports under Money, Services and Marketplace", async () => {
    render(<ReportsView />, { wrapper });

    expect(await screen.findByRole("tablist", { name: "Money reports" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Services reports" })).toBeInTheDocument();
  });
});

describe("statusTone", () => {
  it("colours statuses by meaning", () => {
    expect(statusTone("Completed")).toBe("success");
    expect(statusTone("Cancelled")).toBe("danger");
    expect(statusTone("In progress")).toBe("warning");
    expect(statusTone("Partially refunded")).toBe("danger");
  });
});
