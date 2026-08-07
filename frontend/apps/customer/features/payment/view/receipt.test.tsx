import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { group, unit, unitLine } from "@/features/bookings/fixtures";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { Receipt } = await import("./receipt");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderReceipt(groupId = "group-1") {
  return render(<Receipt groupId={groupId} />, { wrapper });
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

describe("Receipt component", () => {
  it("renders Vsolve Hub logo and booking details when paid", async () => {
    const mockGroup = group({
      id: "group-123",
      order_id: "order-456",
      units: [
        unit({
          id: "unit-1",
          lines: [unitLine({ id: "line-1", label: "AC Deep Cleaning", amount: { amount_paise: 49900, currency: "INR" } })],
        }),
      ],
    });

    const mockOrder = {
      id: "order-456",
      status: "CONFIRMED" as const,
      total: { amount_paise: 49900, currency: "INR" as const },
      tax_documents: [
        {
          id: "tax-1",
          kind: "INVOICE" as const,
          number: "INV-2026-001",
          issued_at: "2026-08-07T10:00:00Z",
          total: { amount_paise: 49900, currency: "INR" as const },
          is_test: false,
          lines: [{ id: "tl-1", label: "AC Deep Cleaning", quantity: 1, total: { amount_paise: 49900, currency: "INR" as const } }],
        },
      ],
    };

    client.GET.mockImplementation((url: string) => {
      if (url.includes("/booking-groups/")) {
        return Promise.resolve(ok(mockGroup));
      }
      if (url.includes("/orders/")) {
        return Promise.resolve(ok(mockOrder));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    renderReceipt("group-123");

    // Vsolve Hub logo image alt text
    expect(await screen.findByAltText("V Solve Hub")).toBeInTheDocument();

    // Receipt header & details
    expect(screen.getByText(/Payment Receipt & Invoice/i)).toBeInTheDocument();
    expect(screen.getAllByText("AC Deep Cleaning").length).toBeGreaterThan(0);
    expect(screen.getByText(/Tax Invoice for Booking Reference/i)).toBeInTheDocument();
    expect(screen.getAllByText("group-123").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Paid").length).toBeGreaterThan(0);
  });

  it("renders information state when order has not been placed", async () => {
    const mockUnpaidGroup = group({
      id: "group-999",
      order_id: null,
    });

    client.GET.mockResolvedValue(ok(mockUnpaidGroup));

    renderReceipt("group-999");

    expect(await screen.findByText(/There is no receipt yet/i)).toBeInTheDocument();
  });
});
