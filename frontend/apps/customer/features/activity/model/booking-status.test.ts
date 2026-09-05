import { describe, expect, it } from "vitest";

import type { BookingGroup } from "@/features/bookings/queries";
import type { EngagementRowView } from "@/features/engagement/adapters";
import type { RequirementSummary } from "@/features/requirement/queries";

import {
  bookingStatusHref,
  countByStatus,
  engagementSection,
  groupSection,
  requestSection,
  toBookingStatusTab,
} from "./booking-status";

describe("toBookingStatusTab", () => {
  it("accepts the three published views and defaults anything else to active", () => {
    expect(toBookingStatusTab("past")).toBe("past");
    expect(toBookingStatusTab("cancelled")).toBe("cancelled");
    expect(toBookingStatusTab("active")).toBe("active");
    expect(toBookingStatusTab("needs_you")).toBe("active");
    expect(toBookingStatusTab(undefined)).toBe("active");
  });
});

describe("bookingStatusHref", () => {
  it("keeps the default view on the canonical Bookings route", () => {
    expect(bookingStatusHref("active")).toBe("/activity");
    expect(bookingStatusHref("past")).toBe("/activity?status=past");
    expect(bookingStatusHref("cancelled")).toBe("/activity?status=cancelled");
  });
});

describe("Bookings status buckets", () => {
  it("puts open requests in Active and cancelled requests in Cancelled", () => {
    expect(requestSection("QUOTES_READY" as RequirementSummary["status"])).toBe("active");
    expect(requestSection("MATCHING" as RequirementSummary["status"])).toBe("active");
    expect(requestSection("CLOSED_COMPLETE" as RequirementSummary["status"])).toBe("past");
    expect(requestSection("CLOSED_CANCELLED" as RequirementSummary["status"])).toBe("cancelled");
    expect(requestSection("CLOSED_ABANDONED" as RequirementSummary["status"])).toBe("cancelled");
  });

  it("keeps a fundable engagement in Active until it is finished or cancelled", () => {
    const row = {
      nextAction: "fund_stage",
      status: "PENDING_START",
    } as EngagementRowView;

    expect(engagementSection(row)).toBe("active");
    expect(engagementSection({ ...row, status: "COMPLETED" })).toBe("past");
    expect(engagementSection({ ...row, status: "CANCELLED" })).toBe("cancelled");
  });

  it("splits booking groups into active, past, and cancelled", () => {
    expect(groupSection({ status: "PAYMENT_PENDING" } as BookingGroup)).toBe("active");
    expect(groupSection({ status: "BOOKED" } as BookingGroup)).toBe("active");
    expect(groupSection({ status: "COMPLETED" } as BookingGroup)).toBe("past");
    expect(groupSection({ status: "EXPIRED" } as BookingGroup)).toBe("past");
    expect(groupSection({ status: "CANCELLED" } as BookingGroup)).toBe("cancelled");
  });

  it("counts each bucket from the live list", () => {
    expect(
      countByStatus([
        { section: "active" },
        { section: "active" },
        { section: "past" },
        { section: "cancelled" },
      ]),
    ).toEqual({ active: 2, past: 1, cancelled: 1 });
  });
});
