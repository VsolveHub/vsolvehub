import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WindowsView } from "@/features/booking/adapters";

import type { SchedulingGroup } from "../queries";
import { SlotsModal } from "./slots-modal";

/**
 * The per-visit slot picker.
 *
 * The property under test throughout is that this component renders the server's
 * grouping and never invents one — and that it refuses to produce a partial
 * schedule, because Django refuses one too.
 */

const ELECTRICIAN: SchedulingGroup = {
  key: "key-electrician",
  label: "Electrician",
  estimated_duration_minutes: 30,
  cart_item_ids: ["item-1"],
};

const SALON: SchedulingGroup = {
  key: "key-salon",
  label: "Salon Prime",
  estimated_duration_minutes: 130,
  cart_item_ids: ["item-2"],
};

const WINDOWS: WindowsView = {
  estimatedDurationMinutes: 30,
  isEmpty: false,
  isPreliminary: true,
  days: [
    {
      date: "2026-08-10",
      label: "Mon 10 Aug",
      dayOfMonth: "10",
      hasAvailability: true,
      windows: [
        {
          id: "win-1",
          startsAt: "2026-08-10T04:30:00Z",
          startLabel: "10:00 am",
          label: "10:00 am – 11:00 am",
          isAvailable: true,
          unavailableLabel: null,
        },
        {
          id: "win-2",
          startsAt: "2026-08-10T08:30:00Z",
          startLabel: "2:00 pm",
          label: "2:00 pm – 3:00 pm",
          isAvailable: true,
          unavailableLabel: null,
        },
      ],
    },
  ],
};

function renderModal(overrides: Partial<Parameters<typeof SlotsModal>[0]> = {}) {
  const props = {
    open: true,
    groups: [ELECTRICIAN, SALON],
    value: new Map<string, string>(),
    windows: WINDOWS,
    isLoadingWindows: false,
    windowsError: false,
    onRetryWindows: vi.fn(),
    onConfirm: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<SlotsModal {...props} />);
  return props;
}

function chooseSlot(groupLabel: string, timeLabel: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`select ${groupLabel}`, "i") }));
  fireEvent.click(screen.getByRole("button", { name: /mon 10 aug/i }));
  fireEvent.click(screen.getByRole("radio", { name: timeLabel }));
}

describe("visit rows", () => {
  it("renders one row per server group and merges nothing itself", () => {
    renderModal();

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Electrician")).toBeInTheDocument();
    expect(screen.getByText("Salon Prime")).toBeInTheDocument();
  });

  it("states each visit's own estimated length", () => {
    renderModal();

    expect(screen.getByText(/30 mins/i)).toBeInTheDocument();
    expect(screen.getByText(/2 hrs & 10 mins/i)).toBeInTheDocument();
  });

  it("explains why there is more than one time to pick", () => {
    renderModal();

    expect(screen.getByText(/need different professionals/i)).toBeInTheDocument();
  });

  it("says nothing about multiple professionals for a single visit", () => {
    renderModal({ groups: [ELECTRICIAN] });

    expect(screen.queryByText(/need different professionals/i)).not.toBeInTheDocument();
  });
});

describe("confirming a complete schedule", () => {
  it("keeps Confirm disabled until every visit has a start", () => {
    renderModal();

    expect(screen.getByRole("button", { name: /^confirm$/i })).toBeDisabled();

    chooseSlot("Electrician", /10:00 am/i);
    expect(screen.getByRole("button", { name: /^confirm$/i })).toBeDisabled();

    chooseSlot("Salon Prime", /2:00 pm/i);
    expect(screen.getByRole("button", { name: /^confirm$/i })).toBeEnabled();
  });

  it("hands back one start per visit, keyed by the server's own group key", () => {
    const props = renderModal();

    chooseSlot("Electrician", /10:00 am/i);
    chooseSlot("Salon Prime", /2:00 pm/i);
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    const chosen = vi.mocked(props.onConfirm).mock.calls[0]![0] as ReadonlyMap<string, string>;
    expect(chosen.get("key-electrician")).toBe("2026-08-10T04:30:00Z");
    expect(chosen.get("key-salon")).toBe("2026-08-10T08:30:00Z");
  });

  it("sends back the untouched instant the server published", () => {
    const props = renderModal({ groups: [ELECTRICIAN] });

    chooseSlot("Electrician", /10:00 am/i);
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    const chosen = vi.mocked(props.onConfirm).mock.calls[0]![0] as ReadonlyMap<string, string>;
    expect(chosen.get("key-electrician")).toBe(WINDOWS.days[0]!.windows[0]!.startsAt);
  });

  it("tells the customer what is still missing", () => {
    renderModal();

    expect(screen.getByText(/pick a time for every visit/i)).toBeInTheDocument();
  });
});

describe("reopening", () => {
  it("shows times already chosen rather than a blank draft", () => {
    renderModal({ value: new Map([["key-electrician", "2026-08-10T04:30:00Z"]]) });

    expect(
      screen.getByRole("button", { name: /change electrician/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select salon prime/i })).toBeInTheDocument();
  });
});

describe("when start times cannot be loaded", () => {
  it("says nothing has been booked, and offers a retry", () => {
    const props = renderModal({ windowsError: true, windows: undefined });

    fireEvent.click(screen.getByRole("button", { name: /select electrician/i }));
    expect(screen.getByText(/nothing has been booked/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(props.onRetryWindows).toHaveBeenCalled();
  });
});
