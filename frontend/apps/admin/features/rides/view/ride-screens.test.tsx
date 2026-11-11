import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/features/shared/fixtures";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { RideDetail } = await import("./ride-detail");
const { SosQueue } = await import("./sos-queue");

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function ride(state: string) {
  return {
    id: "ride-1",
    state,
    vehicle_type: "BIKE",
    pickup: { latitude: "9.48", longitude: "76.34", address: "Alappuzha beach" },
    drop: { latitude: "9.50", longitude: "76.34", address: "Boat jetty" },
    route_polyline: "",
    fare_paise: 4000,
    waiting_paise: 0,
    final_fare_paise: null,
    payment_method: "CASH_OR_UPI",
    payment_status: "DUE",
    created_at: "2026-11-11T10:00:00Z",
    captain_assigned_at: null,
    captain_arrived_at: null,
    started_at: null,
    completed_at: null,
    cancelled_by: "",
    cancel_reason: "",
    emergency_number: "112",
    service_area_id: "area-1",
    rider: { name: "Priya", phone_number: "+919990000003" },
    captain: { name: "Ravi", phone_number: "+919000077701" },
    vehicle: { vehicle_type: "BIKE", registration_number: "KL04AB1234", make_model: "Honda Shine", colour: "White" },
    otp_attempts: 0,
    dispatch_round: 1,
    no_captain_found_at: null,
    ratings: {},
    transitions: [
      { from_state: "", to_state: "SEARCHING", actor_kind: "RIDER", actor_name: "Priya", reason: "", at: "2026-11-11T10:00:00Z" },
    ],
    offers: [
      {
        captain_id: "cap-1",
        captain_name: "Ravi",
        round: 1,
        status: "ACCEPTED",
        pickup_distance_m: 350,
        offered_at: "2026-11-11T10:00:01Z",
        expires_at: "2026-11-11T10:00:16Z",
        responded_at: "2026-11-11T10:00:05Z",
      },
    ],
  };
}

const SOS = {
  id: "sos-1",
  ride_id: "ride-1",
  ride_state: "IN_TRIP",
  raised_by_name: "Priya",
  raised_by_phone: "+919990000003",
  raised_by_kind: "rider",
  latitude: "9.490000",
  longitude: "76.330000",
  status: "OPEN",
  created_at: "2026-11-11T10:05:00Z",
  resolved_at: null,
  resolved_by_name: null,
  resolution_note: "",
};

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("ride detail", () => {
  it("shows what happened and who was offered the ride", async () => {
    client.GET.mockResolvedValue(ok(ride("IN_TRIP")));
    render(<RideDetail rideId="ride-1" />, { wrapper });

    expect(await screen.findByText("In trip")).toBeInTheDocument();
    expect(screen.getByText("350 m")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("force cancels only with a reason, and sends it", async () => {
    client.GET.mockResolvedValue(ok(ride("IN_TRIP")));
    client.POST.mockResolvedValue(ok(undefined, 204));
    render(<RideDetail rideId="ride-1" />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Force cancel" }));
    const confirm = screen.getByRole("button", { name: "Cancel ride" });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Rider called support" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    const [path, init] = client.POST.mock.calls[0]!;
    expect(path).toBe("/api/v1/operations/rides/{ride_id}/cancel/");
    expect(init.body).toEqual({ reason: "Rider called support" });
  });

  it("offers no force cancel on a finished ride", async () => {
    client.GET.mockResolvedValue(ok(ride("COMPLETED")));
    render(<RideDetail rideId="ride-1" />, { wrapper });

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Force cancel" })).not.toBeInTheDocument();
  });
});

describe("SOS queue", () => {
  it("lists open alerts and resolves one with a note", async () => {
    client.GET.mockResolvedValue(ok({ next: null, previous: null, results: [SOS] }));
    client.POST.mockResolvedValue(ok({ ...SOS, status: "RESOLVED" }));
    render(<SosQueue />, { wrapper });

    expect(await screen.findByText("Priya · rider")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Where it was raised" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps?q=9.490000,76.330000",
    );

    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Called the rider; all fine." } });
    fireEvent.click(screen.getAllByRole("button", { name: "Resolve" }).at(-1)!);

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    const [path, init] = client.POST.mock.calls[0]!;
    expect(path).toBe("/api/v1/operations/rides/sos/{sos_id}/resolve/");
    expect(init.body).toEqual({ resolution_note: "Called the rider; all fine." });
    expect(client.GET.mock.calls[0]![1].params.query).toMatchObject({ status: "OPEN" });
  });
});
