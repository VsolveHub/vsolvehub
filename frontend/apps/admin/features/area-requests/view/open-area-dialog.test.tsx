import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperationsAreaRequestGroup } from "../queries";
import { OpenAreaDialog } from "./open-area-dialog";

const calls = vi.hoisted(() => ({
  createArea: vi.fn(),
  addPin: vi.fn(),
  toggle: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  getApiClient: () => ({ GET: calls.get }),
}));
vi.mock("@/features/areas/queries", () => ({
  useCreateServiceArea: () => ({ mutateAsync: calls.createArea, isPending: false }),
  useAddPin: () => ({ mutateAsync: calls.addPin, isPending: false }),
  useToggleService: () => ({ mutateAsync: calls.toggle, isPending: false }),
}));

const group = (overrides: Partial<OperationsAreaRequestGroup> = {}): OperationsAreaRequestGroup =>
  ({
    postal_code: "509216",
    place: "Shadnagar",
    state: "Telangana",
    in_pin_list: true,
    status: "WAITING",
    covering_area_id: null,
    covering_area_name: null,
    request_count: 7,
    trades: ["Electrician", "Plumber"],
    trade_counts: [
      { trade_name: "Electrician", skill_code: "electrician", count: 6 },
      { trade_name: "Plumber", skill_code: "plumber", count: 2 },
    ],
    first_requested_at: "2026-11-01T00:00:00Z",
    latest_requested_at: "2026-11-02T00:00:00Z",
    notified_at: null,
    customer_lookups_28d: 3,
    ...overrides,
  }) as OperationsAreaRequestGroup;

beforeEach(() => {
  vi.clearAllMocks();
  calls.createArea.mockResolvedValue({ id: "area-1", name: "Shadnagar" });
  calls.addPin.mockResolvedValue({});
  calls.toggle.mockResolvedValue({});
  calls.get.mockResolvedValue({
    data: {
      services: [
        { variant_id: "v-e1", skill_code: "electrician", is_active: false },
        { variant_id: "v-e2", skill_code: "electrician", is_active: false },
        { variant_id: "v-p1", skill_code: "plumber", is_active: false },
      ],
    },
    error: undefined,
    response: new Response(null, { status: 200 }),
  });
});

describe("Open new area", () => {
  it("ticks only the trades with five or more asks", () => {
    render(<OpenAreaDialog group={group()} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: /Electrician/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Plumber/ })).not.toBeChecked();
  });

  it("creates the area, adds the PIN and switches on only the ticked trades", async () => {
    const onOpenChange = vi.fn();
    render(<OpenAreaDialog group={group()} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^Open area$/ }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(calls.createArea).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Shadnagar", slug: "shadnagar", is_accepting_partners: true }),
    );
    expect(calls.addPin).toHaveBeenCalledWith(
      expect.objectContaining({ areaId: "area-1", postalCode: "509216" }),
    );
    expect(calls.toggle).toHaveBeenCalledTimes(2);
    expect(calls.toggle).toHaveBeenCalledWith({ areaId: "area-1", variantId: "v-e1", isActive: true });
    expect(calls.toggle).not.toHaveBeenCalledWith(expect.objectContaining({ variantId: "v-p1" }));
  });

  it("asks for city and state when the PIN is not in our list and creates nothing without them", () => {
    render(
      <OpenAreaDialog
        group={group({ place: null, state: null, in_pin_list: false })}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/We have not loaded this PIN yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Open area$/ }));
    expect(calls.createArea).not.toHaveBeenCalled();
  });

  it("says so when the area exists but a later step failed", async () => {
    calls.addPin.mockRejectedValue(new Error("PIN is in another area"));
    render(<OpenAreaDialog group={group()} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Open area$/ }));
    expect(
      await screen.findByText(/The area was created but a later step failed/),
    ).toBeInTheDocument();
  });
});
