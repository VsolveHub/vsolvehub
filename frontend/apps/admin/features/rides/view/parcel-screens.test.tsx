import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/features/shared/fixtures";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { RideDetail } = await import("./ride-detail");
const { RideList } = await import("./ride-list");
const { RateCards } = await import("./rate-cards");

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const PARCEL_END = {
  name: "Ravi Kumar",
  phone: "9123456780",
  building: "Sky Towers",
  unit: "4B",
  meet_at: "CURB",
  instructions: "Ring twice",
};

function parcelRide(state: string, extra: Record<string, unknown> = {}, parcel: Record<string, unknown> = {}) {
  return {
    id: "ride-1",
    kind: "PARCEL",
    state,
    vehicle_type: "BIKE",
    pickup: { latitude: "9.48", longitude: "76.34", address: "Alappuzha beach" },
    drop: { latitude: "9.50", longitude: "76.34", address: "Boat jetty" },
    route_polyline: "",
    fare_paise: 4000,
    waiting_paise: 0,
    final_fare_paise: 4000,
    payment_method: "CASH_OR_UPI",
    payment_status: "DUE",
    created_at: "2026-11-23T10:00:00Z",
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
      { from_state: "", to_state: "SEARCHING", actor_kind: "RIDER", actor_name: "Priya", reason: "", at: "2026-11-23T10:00:00Z" },
      { from_state: "IN_TRIP", to_state: "COMPLETED", actor_kind: "CAPTAIN", actor_name: "Ravi", reason: "", at: "2026-11-23T10:30:00Z" },
    ],
    offers: [],
    parcel: {
      mode: "SEND",
      payer: "RECEIVER",
      pin_required: true,
      pickup: PARCEL_END,
      drop: { ...PARCEL_END, name: "Asha Rao", phone: "9876543210", unit: "", meet_at: "DOOR", instructions: "" },
      payment_point: "DROP",
      arrived_at_drop_at: "2026-11-23T10:20:00Z",
      delivered_at: null,
      receiver_unavailable_at: null,
      returned_at: null,
      return_fare_paise: null,
      return_payment_status: null,
      pin_attempts: 2,
      ...parcel,
    },
    ...extra,
  };
}

function row(id: string, kind: string, state: string, payment = "DUE") {
  return {
    id,
    kind,
    state,
    vehicle_type: "BIKE",
    service_area_id: "area-1",
    rider_name: "Priya",
    captain_name: "Ravi",
    fare_paise: 4000,
    final_fare_paise: 4000,
    payment_status: payment,
    created_at: "2026-11-23T10:00:00Z",
    cancelled_by: "",
  };
}

const RIDE_CARD = {
  id: "card-1",
  service_area_id: "area-1",
  service_area_name: "Alappuzha",
  vehicle_type: "BIKE",
  kind: "RIDE",
  max_parcel_weight_grams: null,
  parcel_size_label: "",
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
const PARCEL_CARD = {
  ...RIDE_CARD,
  id: "card-2",
  kind: "PARCEL",
  max_parcel_weight_grams: 10_000,
  parcel_size_label: "40 x 30 x 20 cm",
};

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("the rides list: kind and unpaid (§7.1)", () => {
  const page = (results: unknown[]) => ok({ next: null, previous: null, results });

  it("asks for every kind to begin with, and shows each ride's type", async () => {
    client.GET.mockResolvedValue(page([row("a", "PARCEL", "COMPLETED"), row("b", "RIDE", "COMPLETED")]));
    render(<RideList />, { wrapper });

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Delivered")).toBeInTheDocument(); // the parcel
    expect(table.getByText("Completed")).toBeInTheDocument(); // the ride
    expect(table.getByText("Pick up & Drop")).toBeInTheDocument();
    expect(table.getByText("Ride")).toBeInTheDocument();
    const query = client.GET.mock.calls[0]![1].params.query;
    expect(query.kind).toBeUndefined();
    expect(query.state).toContain("RETURNING");
  });

  it("filters by kind", async () => {
    client.GET.mockResolvedValue(page([]));
    render(<RideList />, { wrapper });
    await screen.findByText("No rides going right now");

    fireEvent.click(screen.getByRole("button", { name: "Pick up & Drop" }));

    await waitFor(() => expect(client.GET.mock.calls.at(-1)![1].params.query).toMatchObject({ kind: "PARCEL" }));
    fireEvent.click(screen.getByRole("button", { name: "Rides" }));
    await waitFor(() => expect(client.GET.mock.calls.at(-1)![1].params.query).toMatchObject({ kind: "RIDE" }));
  });

  it("shows unpaid parcels across every state, for follow-up", async () => {
    client.GET.mockResolvedValue(page([row("a", "PARCEL", "RETURNED", "UNPAID")]));
    render(<RideList />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Unpaid" }));

    expect(await screen.findByText("Not paid: follow up")).toBeInTheDocument();
    expect(screen.getByText("Returned")).toBeInTheDocument();
    const query = client.GET.mock.calls.at(-1)![1].params.query;
    expect(query.payment_status).toBe("UNPAID");
    expect(query.state).toBeUndefined();
  });

  it("explains an empty Unpaid list", async () => {
    client.GET.mockResolvedValue(page([]));
    render(<RideList />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Unpaid" }));

    expect(await screen.findByText("Nothing unpaid")).toBeInTheDocument();
  });
});

describe("a parcel's detail (§7.2)", () => {
  it("shows who pays, the PIN, every step's time and both ends' details", async () => {
    client.GET.mockResolvedValue(ok(parcelRide("IN_TRIP")));
    render(<RideDetail rideId="ride-1" />, { wrapper });

    expect(await screen.findByText("Pick up & Drop · BIKE")).toBeInTheDocument();
    expect(screen.getByText("Sending")).toBeInTheDocument();
    expect(screen.getByText("Receiver pays, at the drop")).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument(); // PIN confirmation
    expect(screen.getByText("2 of 5")).toBeInTheDocument(); // wrong PINs
    expect(screen.getByText("Ravi Kumar", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Sky Towers · 4B")).toBeInTheDocument();
    expect(screen.getByText("Ring twice")).toBeInTheDocument();
    expect(screen.getByText("Meet at curb")).toBeInTheDocument();
    expect(screen.getByText("Meet at door")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+91 9876543210" })).toHaveAttribute("href", "tel:+919876543210");
  });

  it("shows the return trip and says when nobody paid for it", async () => {
    client.GET.mockResolvedValue(
      ok(
        parcelRide(
          "RETURNED",
          { payment_status: "UNPAID", final_fare_paise: 7000 },
          { return_fare_paise: 3000, return_payment_status: "UNPAID", returned_at: "2026-11-23T11:00:00Z" },
        ),
      ),
    );
    render(<RideDetail rideId="ride-1" />, { wrapper });

    expect((await screen.findAllByText("Returned")).length).toBeGreaterThan(0); // the state and the step
    expect(screen.getByText("₹30")).toBeInTheDocument();
    expect(screen.getAllByText("Not paid: follow up").length).toBe(2); // the fare and the return trip
  });

  it("lets Operations force cancel a parcel that is coming back", async () => {
    client.GET.mockResolvedValue(ok(parcelRide("RETURNING", {}, { return_fare_paise: 3000, return_payment_status: "DUE" })));
    render(<RideDetail rideId="ride-1" />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Force cancel" }));

    expect(screen.getByText(/The trip is under way/)).toBeInTheDocument();
  });

  it("offers no force cancel once the parcel is back or delivered", async () => {
    client.GET.mockResolvedValue(ok(parcelRide("RETURNED")));
    render(<RideDetail rideId="ride-1" />, { wrapper });

    expect((await screen.findAllByText("Returned")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Force cancel" })).not.toBeInTheDocument();
  });

  it("calls a completed parcel Delivered, and still shows both ends (Operations always can)", async () => {
    client.GET.mockResolvedValue(ok(parcelRide("COMPLETED", {}, { delivered_at: "2026-11-23T10:30:00Z" })));
    render(<RideDetail rideId="ride-1" />, { wrapper });

    expect((await screen.findAllByText("Delivered")).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "+91 9123456780" })).toBeInTheDocument();
  });

  it("shows no parcel block for a plain ride", async () => {
    client.GET.mockResolvedValue(ok({ ...parcelRide("IN_TRIP"), kind: "RIDE", parcel: null }));
    render(<RideDetail rideId="ride-1" />, { wrapper });

    expect(await screen.findByText("BIKE ride")).toBeInTheDocument();
    expect(screen.queryByText("Pickup and drop details")).not.toBeInTheDocument();
  });
});

describe("parcel rate cards (§7.3)", () => {
  async function openAdd() {
    client.GET.mockResolvedValue(ok([RIDE_CARD, PARCEL_CARD]));
    render(<RateCards />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Add rate card" }));
    return screen.getByRole("dialog");
  }

  function fillPrices(dialog: HTMLElement) {
    const values = ["30", "1000", "7", "1", "30", "3", "1"];
    const boxes = within(dialog).getAllByRole("textbox").filter((box) => box.getAttribute("inputmode") === "decimal");
    boxes.slice(0, 7).forEach((box, index) => fireEvent.change(box, { target: { value: values[index] } }));
  }

  it("lists each card's type, with a parcel card's limits", async () => {
    client.GET.mockResolvedValue(ok([RIDE_CARD, PARCEL_CARD]));
    render(<RateCards />, { wrapper });

    expect(await screen.findByText("up to 10 kg · 40 x 30 x 20 cm")).toBeInTheDocument();
    expect(screen.getAllByText("Pick up & Drop").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ride").length).toBeGreaterThan(0);
  });

  it("filters the list by kind", async () => {
    client.GET.mockResolvedValue(ok([RIDE_CARD, PARCEL_CARD]));
    render(<RateCards />, { wrapper });
    await screen.findByText("up to 10 kg · 40 x 30 x 20 cm");

    fireEvent.click(screen.getByRole("button", { name: "Rides" }));
    expect(screen.queryByText("up to 10 kg · 40 x 30 x 20 cm")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pick up & Drop" }));
    expect(screen.getByText("up to 10 kg · 40 x 30 x 20 cm")).toBeInTheDocument();
  });

  it("offers Bike and Auto only for a parcel card, and starts from the defaults", async () => {
    const dialog = await openAdd();

    fireEvent.change(within(dialog).getByLabelText(/^For/), { target: { value: "PARCEL" } });

    const options = within(within(dialog).getByLabelText(/^Vehicle/)).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining(["Bike", "Auto"]));
    expect(options).not.toContain("Cab");
    fireEvent.change(within(dialog).getByLabelText(/^Vehicle/), { target: { value: "AUTO" } });
    expect(within(dialog).getByLabelText(/^Max weight/)).toHaveValue("50");
    expect(within(dialog).getByLabelText(/^Size/)).toHaveValue("1.3 x 3.5 x 3.3 ft");
  });

  it("creates a parcel card with its kind and limits", async () => {
    client.POST.mockResolvedValue(ok({ ...PARCEL_CARD, id: "card-3" }));
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText(/^For/), { target: { value: "PARCEL" } });
    fireEvent.change(within(dialog).getByLabelText(/^Area/), { target: { value: "area-1" } });
    fireEvent.change(within(dialog).getByLabelText(/^Vehicle/), { target: { value: "BIKE" } });
    fillPrices(dialog);
    fireEvent.change(within(dialog).getByLabelText(/^Max weight/), { target: { value: "12.5" } });

    fireEvent.click(within(dialog).getByRole("button", { name: "Add card" }));

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    const [path, init] = client.POST.mock.calls[0]!;
    expect(path).toBe("/api/v1/operations/rides/rate-cards/");
    expect(init.body).toMatchObject({
      service_area_id: "area-1",
      vehicle_type: "BIKE",
      kind: "PARCEL",
      max_parcel_weight_grams: 12_500,
      parcel_size_label: "40 x 30 x 20 cm",
      base_fare_paise: 3000,
    });
  });

  it("creates a ride card with no limits, and a cab is sent as CAB", async () => {
    client.POST.mockResolvedValue(ok({ ...RIDE_CARD, id: "card-4" }));
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText(/^Area/), { target: { value: "area-1" } });
    fireEvent.change(within(dialog).getByLabelText(/^Vehicle/), { target: { value: "CAB" } });
    fillPrices(dialog);
    expect(within(dialog).queryByLabelText(/^Max weight/)).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Add card" }));

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    const body = client.POST.mock.calls[0]![1].body;
    expect(body).toMatchObject({ vehicle_type: "CAB", kind: "RIDE" });
    expect(body).not.toHaveProperty("max_parcel_weight_grams");
  });

  it("refuses a parcel card with no weight, and says which box", async () => {
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText(/^For/), { target: { value: "PARCEL" } });
    fireEvent.change(within(dialog).getByLabelText(/^Area/), { target: { value: "area-1" } });
    fireEvent.change(within(dialog).getByLabelText(/^Vehicle/), { target: { value: "BIKE" } });
    fillPrices(dialog);
    fireEvent.change(within(dialog).getByLabelText(/^Max weight/), { target: { value: "" } });

    fireEvent.click(within(dialog).getByRole("button", { name: "Add card" }));

    const weight = within(dialog).getByLabelText(/^Max weight/);
    expect(weight).toHaveAttribute("aria-invalid", "true");
    expect(weight).toHaveAccessibleDescription(expect.stringContaining("Enter a weight above 0 kg."));
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("shows what is missing under each box when Add card is pressed on an empty form", async () => {
    const dialog = await openAdd();

    fireEvent.click(within(dialog).getByRole("button", { name: "Add card" }));

    expect(within(dialog).getByText("Choose an area.")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose a vehicle.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Base fare/)).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getAllByText("Enter an amount in rupees, 0 or more.").length).toBe(5);
    expect(client.POST).not.toHaveBeenCalled();

    // Fixing a box takes its message away.
    fireEvent.change(within(dialog).getByLabelText(/^Area/), { target: { value: "area-1" } });
    expect(within(dialog).queryByText("Choose an area.")).not.toBeInTheDocument();
  });

  it("edits a parcel card's limits on their own, as a new version", async () => {
    client.GET.mockResolvedValue(ok([PARCEL_CARD]));
    client.PATCH.mockResolvedValue(ok({ ...PARCEL_CARD, id: "card-9", max_parcel_weight_grams: 15_000, version: 2 }));
    render(<RateCards />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText(/^Max weight/), { target: { value: "15" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save new version" }));

    await waitFor(() => expect(client.PATCH).toHaveBeenCalledTimes(1));
    expect(client.PATCH.mock.calls[0]![1].body).toEqual({ max_parcel_weight_grams: 15_000 });
  });

  it("shows no weight or size when editing a ride card", async () => {
    client.GET.mockResolvedValue(ok([RIDE_CARD]));
    render(<RateCards />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    expect(within(screen.getByRole("dialog")).queryByLabelText(/^Max weight/)).not.toBeInTheDocument();
  });

  it("explains that switching off a parcel card hides only Pick up & Drop", async () => {
    client.GET.mockResolvedValue(ok([PARCEL_CARD]));
    client.PATCH.mockResolvedValue(ok({ ...PARCEL_CARD, is_active: false }));
    render(<RateCards />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Switch off" }));

    expect(screen.getByText(/Customers here stop seeing Pick up & Drop for this vehicle/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Switch off" }));

    await waitFor(() => expect(client.PATCH).toHaveBeenCalledTimes(1));
    expect(client.PATCH.mock.calls[0]![1].body).toEqual({ is_active: false });
  });
});
