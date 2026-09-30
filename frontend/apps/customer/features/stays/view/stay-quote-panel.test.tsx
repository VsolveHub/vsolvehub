import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
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
    title: "Green Villa PG",
    variant: "variant-1",
    description: "Cozy rooms with all amenities.",
    host_name: "Ramesh Rao",
    location_text: "Gachibowli, Hyderabad",
    min_stay_nights: 1,
    booking_mode: "RESERVATION",
    public_state: "PUBLISHED",
    media: [],
    reviews: [],
    created_at: "2026-08-01T10:00:00Z",
    structured_fields: {},
    units: [
      {
        id: "unit-1",
        name: "Deluxe Single Room",
        sharing_count: 1,
        nightly_rate_paise: 150_000,
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
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("StayQuotePanel error presentations", () => {
  it("shows Minimum stay is N nights when client dates violate property min_stay_nights", async () => {
    client.GET.mockResolvedValue(
      ok({
        nightly_rate_paise: 150_000,
        total_quote_paise: 450_000,
        nights: 3,
        min_stay_nights: 5,
        available: true,
      }),
    );

    const prop = mockProperty({ min_stay_nights: 5 });
    render(<StayQuotePanel property={prop} />, { wrapper });

    expect(await screen.findByText("Minimum stay is 5 nights.")).toBeInTheDocument();
    const submitBtn = screen.getByRole("button", { name: /Pay & Reserve/i });
    expect(submitBtn).toBeDisabled();
  });

  it("shows Minimum stay is N nights when quote query returns min_stay_not_met code", async () => {
    client.GET.mockResolvedValue(refusal("min_stay_not_met", "Minimum stay is 4 nights."));

    const prop = mockProperty({ min_stay_nights: 4 });
    render(<StayQuotePanel property={prop} />, { wrapper });

    expect(await screen.findByText("Minimum stay is 4 nights.")).toBeInTheDocument();
    const submitBtn = screen.getByRole("button", { name: /Pay & Reserve/i });
    expect(submitBtn).toBeDisabled();
  });

  it("shows Not available for these dates when client dates fall outside available_from/until", async () => {
    client.GET.mockResolvedValue(
      ok({
        nightly_rate_paise: 150_000,
        total_quote_paise: 450_000,
        nights: 3,
        min_stay_nights: 1,
        available: true,
      }),
    );

    const prop = mockProperty({
      min_stay_nights: 1,
      available_from: "2099-01-01",
      available_until: "2099-12-31",
    });
    render(<StayQuotePanel property={prop} />, { wrapper });

    expect(await screen.findByText("Not available for these dates.")).toBeInTheDocument();
    const submitBtn = screen.getByRole("button", { name: /Pay & Reserve/i });
    expect(submitBtn).toBeDisabled();
  });

  it("shows Not available for these dates when quote query returns dates_unavailable code", async () => {
    client.GET.mockResolvedValue(refusal("dates_unavailable", "Not available for these dates."));

    const prop = mockProperty({ min_stay_nights: 1 });
    render(<StayQuotePanel property={prop} />, { wrapper });

    expect(await screen.findByText("Not available for these dates.")).toBeInTheDocument();
    const submitBtn = screen.getByRole("button", { name: /Pay & Reserve/i });
    expect(submitBtn).toBeDisabled();
  });

  it("shows friendlyErrorMessage fallback when quote query returns an unexpected error code", async () => {
    client.GET.mockResolvedValue(refusal("rate_unavailable", "Could not calculate quote at this time."));

    const prop = mockProperty({ min_stay_nights: 1 });
    render(<StayQuotePanel property={prop} />, { wrapper });

    expect(
      await screen.findByText("Could not calculate quote at this time."),
    ).toBeInTheDocument();
    const submitBtn = screen.getByRole("button", { name: /Pay & Reserve/i });
    expect(submitBtn).toBeDisabled();
  });

  it("shows Minimum stay is N nights when reservation mutation fails with min_stay_not_met code", async () => {
    client.GET.mockResolvedValue(
      ok({
        nightly_rate_paise: 150_000,
        total_quote_paise: 450_000,
        nights: 3,
        min_stay_nights: 3,
        available: true,
      }),
    );
    client.POST.mockResolvedValue(refusal("min_stay_not_met", "Minimum stay is 3 nights."));

    const prop = mockProperty({ min_stay_nights: 3 });
    render(<StayQuotePanel property={prop} />, { wrapper });

    const submitBtn = await screen.findByRole("button", { name: /Pay & Reserve/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    expect(await screen.findByText("Minimum stay is 3 nights.")).toBeInTheDocument();
  });

  it("shows Not available for these dates when reservation mutation fails with dates_unavailable code", async () => {
    client.GET.mockResolvedValue(
      ok({
        nightly_rate_paise: 150_000,
        total_quote_paise: 450_000,
        nights: 3,
        min_stay_nights: 1,
        available: true,
      }),
    );
    client.POST.mockResolvedValue(refusal("dates_unavailable", "Dates are no longer available."));

    const prop = mockProperty({ min_stay_nights: 1 });
    render(<StayQuotePanel property={prop} />, { wrapper });

    const submitBtn = await screen.findByRole("button", { name: /Pay & Reserve/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    expect(await screen.findByText("Not available for these dates.")).toBeInTheDocument();
  });

  it("shows friendlyErrorMessage fallback when reservation mutation fails with generic error", async () => {
    client.GET.mockResolvedValue(
      ok({
        nightly_rate_paise: 150_000,
        total_quote_paise: 450_000,
        nights: 3,
        min_stay_nights: 1,
        available: true,
      }),
    );
    client.POST.mockResolvedValue(refusal("internal_error", "Server encountered an issue."));

    const prop = mockProperty({ min_stay_nights: 1 });
    render(<StayQuotePanel property={prop} />, { wrapper });

    const submitBtn = await screen.findByRole("button", { name: /Pay & Reserve/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    expect(await screen.findByText("Server encountered an issue.")).toBeInTheDocument();
  });

  it("handles ENQUIRY mode error codes for min_stay_not_met and dates_unavailable", async () => {
    client.GET.mockResolvedValue(
      ok({
        nightly_rate_paise: 150_000,
        total_quote_paise: 450_000,
        nights: 3,
        min_stay_nights: 1,
        available: true,
      }),
    );
    client.POST.mockResolvedValue(refusal("dates_unavailable"));

    const prop = mockProperty({ min_stay_nights: 1, booking_mode: "ENQUIRY" });
    render(<StayQuotePanel property={prop} />, { wrapper });

    const submitBtn = await screen.findByRole("button", { name: /Send Stay Enquiry/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    expect(await screen.findByText("Not available for these dates.")).toBeInTheDocument();
  });
});
