import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import { ToastProvider } from "@vsolve/ui";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StayQuotePanel } from "./stay-quote-panel";

const client = {
  GET: vi.fn(),
  POST: vi.fn(),
  PATCH: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
};
const push = vi.fn();

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push, replace: vi.fn() }),
}));

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function refusal(code: string, message = "Refusal message", status = 400) {
  return {
    data: undefined,
    error: { error: { code, message, details: null, retryable: false, request_id: "req-1" } },
    response: new Response(null, { status }),
  };
}

function mockProperty(overrides: Partial<Schemas["Property"]> = {}): Schemas["Property"] {
  return {
    id: "prop-1",
    slug: "demo-pg",
    title: "Green Villa PG",
    variant: "variant-1",
    description: "Cozy rooms with all amenities.",
    host_name: "Ramesh Rao",
    location_text: "Gachibowli, Hyderabad",
    min_stay_nights: 1,
    booking_mode: "ENQUIRY",
    price_period: "MONTH",
    room_style: "SHARED",
    amenities: [],
    highlights: [],
    can_review: false,
    public_state: "PUBLISHED",
    media: [],
    reviews: [],
    created_at: "2026-08-01T10:00:00Z",
    structured_fields: {},
    units: [
      {
        id: "unit-1",
        name: "Double sharing",
        sharing_count: 2,
        max_guests: 2,
        nightly_rate_paise: 900_000,
        is_active: true,
      },
    ],
    ...overrides,
  };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
  push.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("StayQuotePanel", () => {
  it("asks a monthly stay in months and shows the rent estimate", async () => {
    client.GET.mockResolvedValue(
      ok({ nightly_rate_paise: 900_000, total_quote_paise: 900_000, stay_length: 1 }),
    );

    render(<StayQuotePanel property={mockProperty()} />, { wrapper });

    expect(screen.getByText("Move-in date")).toBeInTheDocument();
    expect(screen.getByText("For how many months")).toBeInTheDocument();
    expect(await screen.findByText("about ₹9,000")).toBeInTheDocument();
  });

  it("asks a nightly stay in nights", () => {
    client.GET.mockResolvedValue(ok({ nightly_rate_paise: 250_000, total_quote_paise: 250_000 }));

    render(<StayQuotePanel property={mockProperty({ price_period: "NIGHT" })} />, { wrapper });

    expect(screen.getByText("Check-in date")).toBeInTheDocument();
    expect(screen.getByText("For how many nights")).toBeInTheDocument();
  });

  it("tells the guest their number goes to the host and nothing is paid", () => {
    client.GET.mockResolvedValue(ok({ nightly_rate_paise: 900_000, total_quote_paise: 900_000 }));

    render(<StayQuotePanel property={mockProperty()} />, { wrapper });

    expect(
      screen.getByText(/name and phone number are shared with the host/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pay/i })).not.toBeInTheDocument();
  });

  it("sends the length, not a check-out date", async () => {
    client.GET.mockResolvedValue(ok({ nightly_rate_paise: 900_000, total_quote_paise: 900_000 }));
    client.POST.mockResolvedValue(ok({ id: "enq-1" }, 201));

    render(<StayQuotePanel property={mockProperty()} />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /Send enquiry/i }));

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    const body = client.POST.mock.calls[0]![1].body;
    expect(body).toMatchObject({ property_id: "prop-1", unit_id: "unit-1", length: 1 });
    expect(body).not.toHaveProperty("check_out");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/stays/mine"));
  });

  it("explains a minimum stay in the property's unit", async () => {
    client.GET.mockResolvedValue(refusal("min_stay_not_met"));

    render(<StayQuotePanel property={mockProperty({ min_stay_nights: 3 })} />, { wrapper });

    expect(await screen.findByText("Minimum stay is 3 months.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send enquiry/i })).toBeDisabled();
  });
});
