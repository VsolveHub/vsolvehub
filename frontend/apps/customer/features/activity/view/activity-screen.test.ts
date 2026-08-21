import { describe, expect, it } from "vitest";

import type { BookingGroup } from "@/features/bookings/queries";
import type { EngagementRowView } from "@/features/engagement/adapters";
import type { RequirementSummary } from "@/features/requirement/queries";

import {
  engagementSection,
  groupSection,
  requestBelongsInBookings,
  requestSection,
} from "./activity-screen";
import { ACTIVITY_TABS, activityTabHref, toActivityTab } from "../model/routes";

describe("legacy activity links", () => {
  it("keeps every old tab and redirect on the single Bookings route", () => {
    for (const tab of ACTIVITY_TABS) {
      expect(activityTabHref(tab)).toBe("/activity");
      expect(toActivityTab(tab)).toBe("booked");
    }
  });
});

describe("Bookings lifecycle sections", () => {
  it("puts customer decisions in Needs you and closed requests in Past", () => {
    expect(requestSection("QUOTES_READY" as RequirementSummary["status"])).toBe("needs_you");
    expect(requestSection("MATCHING" as RequirementSummary["status"])).toBe("active");
    expect(requestSection("CLOSED_CANCELLED" as RequirementSummary["status"])).toBe("past");
  });

  it("dedupes a request once its engagement is the canonical booking", () => {
    expect(requestBelongsInBookings({ engagement_id: null } as RequirementSummary)).toBe(true);
    expect(
      requestBelongsInBookings({ engagement_id: "engagement-1" } as RequirementSummary),
    ).toBe(false);
  });

  it("puts a fundable engagement in Needs you before considering its status", () => {
    const row = {
      nextAction: "fund_stage",
      status: "PENDING_START",
    } as EngagementRowView;

    expect(engagementSection(row)).toBe("needs_you");
  });

  it("keeps booking recovery visible and completed bookings in Past", () => {
    expect(groupSection({ status: "PAYMENT_PENDING" } as BookingGroup)).toBe("needs_you");
    expect(groupSection({ status: "BOOKED" } as BookingGroup)).toBe("active");
    expect(groupSection({ status: "COMPLETED" } as BookingGroup)).toBe("past");
  });
});
