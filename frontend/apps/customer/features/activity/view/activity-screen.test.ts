import { describe, expect, it } from "vitest";

import type { RequirementSummary } from "@/features/requirement/queries";

import { ACTIVITY_TABS, activityTabHref, toActivityTab } from "../model/routes";
import { requestBelongsInBookings } from "./activity-screen";

describe("legacy activity links", () => {
  it("keeps every old tab and redirect on the single Bookings route", () => {
    for (const tab of ACTIVITY_TABS) {
      expect(activityTabHref(tab)).toBe("/activity");
      expect(toActivityTab(tab)).toBe("booked");
    }
  });
});

describe("Bookings lifecycle sections", () => {
  it("dedupes a request once its engagement is the canonical booking", () => {
    expect(requestBelongsInBookings({ engagement_id: null } as RequirementSummary)).toBe(true);
    expect(
      requestBelongsInBookings({ engagement_id: "engagement-1" } as RequirementSummary),
    ).toBe(false);
  });
});
