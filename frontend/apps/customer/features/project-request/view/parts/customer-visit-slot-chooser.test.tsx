import type { Schemas } from "@vsolve/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { readCustomerVisitSlotGrid } from "../../model/customer-visit-slots";
import { CustomerVisitSlotChooser } from "./customer-visit-slot-chooser";

const RAW_GRID: Schemas["VisitSlotGrid"] = {
  server_now: "2026-08-25T10:00:00Z",
  visit_duration_minutes: 120,
  turnaround_minutes: 20,
  availability_is_preliminary: true,
  timezone: "Asia/Kolkata",
  days: [
    {
      date: "2026-09-02",
      is_today: false,
      slots: [
        {
          id: "signed-9",
          starts_at: "2026-09-02T03:30:00Z",
          ends_at: "2026-09-02T05:30:00Z",
          is_available: true,
          unavailable_reason: null,
        },
        {
          // A real gap. Adjacent slots clash once the turnaround is counted, which is
          // the server's own rule — a fixture without the gap tests an impossible pair.
          id: "signed-11",
          starts_at: "2026-09-02T06:00:00Z",
          ends_at: "2026-09-02T08:00:00Z",
          is_available: true,
          unavailable_reason: null,
        },
      ],
    },
  ],
};

function Harness() {
  const [selected, setSelected] = useState<readonly (string | null)[]>([null, null]);
  return (
    <CustomerVisitSlotChooser
      planSize={2}
      grid={readCustomerVisitSlotGrid(RAW_GRID)}
      selectedStarts={selected}
      onChange={(index, startsAt) =>
        setSelected((current) => current.map((value, row) => (row === index ? startsAt : value)))
      }
      isLoading={false}
      error={null}
      onRetry={() => undefined}
    />
  );
}

describe("CustomerVisitSlotChooser", () => {
  it("requires and records one visible time for each requested estimate", () => {
    render(<Harness />);

    expect(screen.getByText("0 of 2 visit times chosen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Visit 1. Choose a time." }));
    fireEvent.click(screen.getByRole("radio", { name: /9:00 am – 11:00 am/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use this time" }));

    expect(screen.getByText("1 of 2 visit times chosen")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Visit 1.*9:00 am – 11:00 am.*Change/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Visit 2. Choose a time." }));
    expect(screen.getByRole("radio", { name: /9:00 am – 11:00 am/i })).toBeDisabled();
    // "Too close to", not "used by". With the turnaround counted most blocked slots are
    // merely adjacent to another visit rather than the same one, and telling somebody 6pm
    // is "used" while their only visit is at 5pm reads as a bug.
    expect(screen.getByText("Too close to another visit")).toBeInTheDocument();
  });

  it("only displays available slots, hiding passed and unavailable slots", () => {
    const gridWithUnavailable: Schemas["VisitSlotGrid"] = {
      ...RAW_GRID,
      days: [
        {
          date: "2026-09-02",
          is_today: false,
          slots: [
            {
              id: "passed-slot",
              starts_at: "2026-09-02T01:30:00Z",
              ends_at: "2026-09-02T03:30:00Z",
              is_available: false,
              unavailable_reason: "PAST",
            },
            {
              id: "available-slot",
              starts_at: "2026-09-02T03:30:00Z",
              ends_at: "2026-09-02T05:30:00Z",
              is_available: true,
              unavailable_reason: null,
            },
          ],
        },
      ],
    };

    render(
      <CustomerVisitSlotChooser
        planSize={1}
        grid={readCustomerVisitSlotGrid(gridWithUnavailable)}
        selectedStarts={[null]}
        onChange={() => undefined}
        isLoading={false}
        error={null}
        onRetry={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Visit 1. Choose a time." }));
    expect(screen.queryByText("Already passed")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /9:00 am – 11:00 am/i })).toBeInTheDocument();
  });
});

