import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import {
  readCustomerVisitSlotGrid,
  slotOverlapsAnotherSelection,
  tokensForCustomerVisitSelection,
} from "./customer-visit-slots";

function grid(
  slots: Schemas["VisitSlot"][] = [
    {
      id: "signed-9",
      starts_at: "2026-09-02T03:30:00Z",
      ends_at: "2026-09-02T05:30:00Z",
      is_available: true,
      unavailable_reason: null,
    },
    {
      // 06:00, not 05:30. Back-to-back is refused by `occupied_range_bounds`, which
      // adds the turnaround to the first visit — so a fixture with adjacent slots was
      // asserting a pair the server rejects.
      id: "signed-11",
      starts_at: "2026-09-02T06:00:00Z",
      ends_at: "2026-09-02T08:00:00Z",
      is_available: true,
      unavailable_reason: null,
    },
  ],
): Schemas["VisitSlotGrid"] {
  return {
    server_now: "2026-08-25T10:00:00Z",
      visit_duration_minutes: 120,
    turnaround_minutes: 20,
    availability_is_preliminary: true,
    timezone: "Asia/Kolkata",
    days: [{ date: "2026-09-02", is_today: false, slots }],
  };
}

describe("Customer visit slot grid", () => {
  it("keeps signed tokens opaque and formats the site's local time", () => {
    const view = readCustomerVisitSlotGrid(grid());

    expect(view.days[0]?.slots[0]).toMatchObject({
      token: "signed-9",
      startsAt: "2026-09-02T03:30:00Z",
      label: "9:00 am – 11:00 am",
      isAvailable: true,
    });
    expect(view.openCount).toBe(2);
  });

  it("returns exactly one current token per requested estimate", () => {
    const view = readCustomerVisitSlotGrid(grid());

    expect(
      tokensForCustomerVisitSelection(
        view,
        ["2026-09-02T03:30:00Z", "2026-09-02T06:00:00Z"],
        2,
      ),
    ).toEqual(["signed-9", "signed-11"]);
  });

  it("refuses a missing, unavailable, or overlapping selection", () => {
    const overlappingGrid = readCustomerVisitSlotGrid(
      grid([
        grid().days[0]!.slots[0]!,
        {
          id: "signed-overlap",
          starts_at: "2026-09-02T04:30:00Z",
          ends_at: "2026-09-02T06:30:00Z",
          is_available: true,
          unavailable_reason: null,
        },
      ]),
    );

    expect(tokensForCustomerVisitSelection(overlappingGrid, [null], 1)).toBeNull();
    expect(
      tokensForCustomerVisitSelection(
        overlappingGrid,
        ["2026-09-02T03:30:00Z", "2026-09-02T04:30:00Z"],
        2,
      ),
    ).toBeNull();
    expect(
      slotOverlapsAnotherSelection({
        slot: overlappingGrid.days[0]!.slots[1]!,
        selectedStarts: ["2026-09-02T03:30:00Z", null],
        visitIndex: 1,
        grid: overlappingGrid,
      }),
    ).toBe(true);
  });

  describe("travel time between visits", () => {
    // The server refuses a slot inside another visit's window *plus* the turnaround
    // (`occupied_range_bounds`). Before `turnaround_minutes` was published the client
    // compared raw windows, called two adjacent hours compatible, and offered a time the
    // write then rejected with "that time overlaps another visit" — on a screen showing
    // 5pm and 6pm, which reads as a bug rather than a rule.
    // 5-6pm and 6-7pm IST: an hour apart on screen, and a clash once the professional
    // has to travel between them.
    const adjacent = () =>
      readCustomerVisitSlotGrid(
        grid([
          {
            id: "five",
            starts_at: "2026-09-02T11:30:00Z",
            ends_at: "2026-09-02T12:30:00Z",
            is_available: true,
            unavailable_reason: null,
          },
          {
            id: "six",
            starts_at: "2026-09-02T12:30:00Z",
            ends_at: "2026-09-02T13:30:00Z",
            is_available: true,
            unavailable_reason: null,
          },
        ]),
      );

    it("blocks the hour immediately after another visit", () => {
      const grid = adjacent();
      expect(
        slotOverlapsAnotherSelection({
          slot: grid.days[0]!.slots[1]!,
          selectedStarts: [null],
          visitIndex: 0,
          grid,
          blockedStarts: ["2026-09-02T11:30:00Z"],
        }),
      ).toBe(true);
    });

    it("allows a slot beyond the turnaround", () => {
      const grid = { ...adjacent(), turnaroundMinutes: 0 };
      expect(
        slotOverlapsAnotherSelection({
          slot: grid.days[0]!.slots[1]!,
          selectedStarts: [null],
          visitIndex: 0,
          grid,
          blockedStarts: ["2026-09-02T11:30:00Z"],
        }),
      ).toBe(false);
    });

    it("sees a visit this picker is not editing, which selectedStarts cannot", () => {
      const grid = adjacent();
      expect(
        slotOverlapsAnotherSelection({
          slot: grid.days[0]!.slots[1]!,
          selectedStarts: [null],
          visitIndex: 0,
          grid,
        }),
      ).toBe(false);
    });

    it("publishes the turnaround the server actually applies", () => {
      expect(adjacent().turnaroundMinutes).toBe(20);
    });
  });
});

