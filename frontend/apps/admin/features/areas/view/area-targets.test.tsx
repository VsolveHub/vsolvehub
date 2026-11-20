import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AreaTargets } from "./area-targets";

const state = vi.hoisted(() => ({ mutate: vi.fn() }));

// Stable between renders, as TanStack Query data is: a fresh object each render would re-run the
// component's load effect forever.
const targets = vi.hoisted(() => ({
  service_area_id: "a1",
  overall: { target_partners: 10, alert_below: null, approved_partners: 2, flag: "RED" },
  trades: [
    {
      skill_code: "electrician",
      skill_name: "Electrician",
      target_partners: null,
      alert_below: null,
      approved_partners: 1,
      flag: "NONE",
    },
  ],
}));

vi.mock("../queries", () => ({
  useAreaTargets: () => ({ isLoading: false, error: null, data: targets }),
  useUpdateAreaTargets: () => ({ mutate: state.mutate, isPending: false }),
}));

beforeEach(() => vi.clearAllMocks());

describe("Supply target", () => {
  it("shows approved partners and the flag against the target", () => {
    render(<AreaTargets areaId="a1" />);
    expect(screen.getByText("(2 approved)")).toBeInTheDocument();
    expect(screen.getByText("Short")).toBeInTheDocument();
    expect(screen.getByText("No target")).toBeInTheDocument();
  });

  it("saves the whole set, with an empty box meaning no target", () => {
    render(<AreaTargets areaId="a1" />);
    fireEvent.change(screen.getByLabelText("Electrician target"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Whole area alert below"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Save targets/ }));
    expect(state.mutate).toHaveBeenCalledWith(
      {
        areaId: "a1",
        overall: { target_partners: 10, alert_below: 3 },
        trades: [{ skill_code: "electrician", target_partners: 4, alert_below: null }],
      },
      expect.any(Object),
    );
  });

  it("refuses a target that is not a whole number and does not send it", () => {
    render(<AreaTargets areaId="a1" />);
    fireEvent.change(screen.getByLabelText("Whole area target"), { target: { value: "ten" } });
    fireEvent.click(screen.getByRole("button", { name: /Save targets/ }));
    expect(screen.getByText(/whole numbers/)).toBeInTheDocument();
    expect(state.mutate).not.toHaveBeenCalled();
  });
});
