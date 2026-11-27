import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/features/shared/fixtures";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { RateCards } = await import("./rate-cards");
const { PassPlans } = await import("./pass-plans");

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const CARD = {
  id: "card-1",
  service_area_id: "area-1",
  service_area_name: "Alappuzha",
  vehicle_type: "BIKE",
  base_fare_paise: 1500,
  included_distance_m: 1000,
  per_km_paise: 600,
  per_minute_paise: 100,
  minimum_fare_paise: 2500,
  free_waiting_minutes: 3,
  waiting_per_minute_paise: 100,
  is_active: true,
  version: 1,
  created_at: "2026-11-06T10:00:00Z",
};

const PLAN = {
  id: "plan-1",
  code: "DAILY_BIKE",
  name: "Daily Pass",
  price_paise: 4900,
  duration_hours: 24,
  vehicle_type: null,
  max_trips: null,
  is_active: true,
  created_at: "2026-11-06T10:00:00Z",
};

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("rate cards", () => {
  it("an edit sends only the changed price, as a new version", async () => {
    client.GET.mockResolvedValue(ok([CARD]));
    client.PATCH.mockResolvedValue(ok({ ...CARD, id: "card-2", per_km_paise: 700, version: 2 }));
    render(<RateCards />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Per km after that/), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new version" }));

    await waitFor(() => expect(client.PATCH).toHaveBeenCalledTimes(1));
    const [path, init] = client.PATCH.mock.calls[0]!;
    expect(path).toBe("/api/v1/operations/rides/rate-cards/{card_id}/");
    expect(init.body).toEqual({ per_km_paise: 700 });
  });

  it("switching off sends only is_active false", async () => {
    client.GET.mockResolvedValue(ok([CARD]));
    client.PATCH.mockResolvedValue(ok({ ...CARD, is_active: false }));
    render(<RateCards />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Switch off" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Switch off" }).at(-1)!);

    await waitFor(() => expect(client.PATCH).toHaveBeenCalledTimes(1));
    expect(client.PATCH.mock.calls[0]![1].body).toEqual({ is_active: false });
  });
});

describe("pass plans", () => {
  it("shows what is missing under each box, and saves nothing", async () => {
    client.GET.mockResolvedValue(ok([PLAN]));
    render(<PassPlans />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Add pass plan" }));
    fireEvent.change(screen.getByLabelText(/^Lasts/), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Add plan" }));

    expect(screen.getByText("Give the plan a code, for example DAILY_BIKE.")).toBeInTheDocument();
    expect(screen.getByText("Give the plan a name captains will see.")).toBeInTheDocument();
    expect(screen.getByText("Enter the price in rupees.")).toBeInTheDocument();
    expect(screen.getByText("A pass lasts at least 1 whole hour.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute("aria-invalid", "true");
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("shows the plan and saves an edited price in paise", async () => {
    client.GET.mockResolvedValue(ok([PLAN]));
    client.PATCH.mockResolvedValue(ok({ ...PLAN, price_paise: 5900 }));
    render(<PassPlans />, { wrapper });

    expect(await screen.findByText("Daily Pass")).toBeInTheDocument();
    expect(screen.getByText("1 day")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "59" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(client.PATCH).toHaveBeenCalledTimes(1));
    expect(client.PATCH.mock.calls[0]![1].body).toEqual({
      name: "Daily Pass",
      price_paise: 5900,
      duration_hours: 24,
      vehicle_type: null,
      max_trips: null,
      is_active: true,
    });
  });

  it("saves a vehicle and a trip limit, and refuses a limit of 0", async () => {
    client.GET.mockResolvedValue(ok([PLAN]));
    client.PATCH.mockResolvedValue(ok({ ...PLAN, vehicle_type: "CAB", max_trips: 100 }));
    render(<PassPlans />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/^Vehicle/), { target: { value: "CAB" } });
    fireEvent.change(screen.getByLabelText(/^Max trips/), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Enter a whole number of trips, at least 1, or leave it empty.")).toBeInTheDocument();
    expect(client.PATCH).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Max trips/), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(client.PATCH).toHaveBeenCalledTimes(1));
    expect(client.PATCH.mock.calls[0]![1].body).toMatchObject({ vehicle_type: "CAB", max_trips: 100 });
  });
});
