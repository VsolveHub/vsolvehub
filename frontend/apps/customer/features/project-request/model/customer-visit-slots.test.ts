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
      id: "signed-11",
      starts_at: "2026-09-02T05:30:00Z",
      ends_at: "2026-09-02T07:30:00Z",
      is_available: true,
      unavailable_reason: null,
    },
  ],
): Schemas["VisitSlotGrid"] {
  return {
    server_now: "2026-08-25T10:00:00Z",
    visit_duration_minutes: 120,
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
        ["2026-09-02T03:30:00Z", "2026-09-02T05:30:00Z"],
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
});

