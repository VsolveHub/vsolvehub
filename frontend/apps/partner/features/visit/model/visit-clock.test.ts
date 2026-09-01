import { describe, expect, it } from "vitest";

import { siteVisit } from "@/features/enquiry/fixtures";

import { dayKeyInZone, describeVisitTiming, timeOnlyInZone } from "./visit-clock";

/**
 * The clock that decides whether the arrival button exists.
 *
 * Every case passes `nowMs` explicitly, which is the property that matters:
 * production reads `serverClock.now()` and nothing in the module ever touches
 * `Date.now()`. A device clock a day fast must not be able to open the arrival
 * window early, and the only way to keep that true is for the module to have no
 * clock of its own.
 */

/** 2026-09-02T08:00 in Asia/Kolkata. */
const VISIT_AT = "2026-09-02T02:30:00Z";

function scheduled(overrides: Parameters<typeof siteVisit>[0] = {}) {
  return siteVisit({
    status: "SCHEDULED",
    is_plan_visit: true,
    timezone: "Asia/Kolkata",
    scheduled_for: VISIT_AT,
    duration_minutes: 60,
    ...overrides,
  });
}

/** An instant on the given IST day, at 09:00 IST. */
function istMorning(day: string): number {
  return Date.parse(`${day}T03:30:00Z`);
}

describe("describeVisitTiming", () => {
  it("says Tomorrow, and counts down in hours and minutes, the day before", () => {
    // 2026-09-01 15:48 IST — 16h 12m before an 08:00 slot on the 2nd.
    const timing = describeVisitTiming(scheduled(), Date.parse("2026-09-01T10:18:00Z"));

    expect(timing?.dayLabel).toBe("Tomorrow");
    expect(timing?.timeLabel).toBe("8:00 am");
    expect(timing?.relative).toBe("starts in 16h 12m");
    expect(timing?.isVisitDay).toBe(false);
    expect(timing?.hasStarted).toBe(false);
  });

  it("keeps the arrival window shut the day before, whatever the device thinks", () => {
    const timing = describeVisitTiming(scheduled(), istMorning("2026-09-01"));

    expect(timing?.arrivalWindowOpen).toBe(false);
  });

  it("opens the arrival window at midnight of the visit day in the site's zone", () => {
    // 00:05 IST on the visit day: eight hours before the slot, and the day
    // before in UTC. The site's calendar day is the one that counts.
    const timing = describeVisitTiming(scheduled(), Date.parse("2026-09-01T18:35:00Z"));

    expect(timing?.dayLabel).toBe("Today");
    expect(timing?.isVisitDay).toBe(true);
    expect(timing?.arrivalWindowOpen).toBe(true);
  });

  it("counts in minutes inside the hour", () => {
    const timing = describeVisitTiming(scheduled(), Date.parse("2026-09-02T01:48:00Z"));

    expect(timing?.relative).toBe("starts in 42m");
    expect(timing?.arrivalWindowOpen).toBe(true);
  });

  it("never shuts the window again on a visit that has already passed", () => {
    // A week late. The vendor still has to be able to record arrival and close
    // the visit, or the estimate the customer paid for can never be sent.
    const timing = describeVisitTiming(scheduled(), istMorning("2026-09-09"));

    expect(timing?.arrivalWindowOpen).toBe(true);
    expect(timing?.hasStarted).toBe(true);
    // Past a day there is nothing useful left to say.
    expect(timing?.relative).toBeNull();
  });

  it("reports elapsed time once the slot has started", () => {
    const timing = describeVisitTiming(scheduled(), Date.parse("2026-09-02T02:42:00Z"));

    expect(timing?.relative).toBe("started 12m ago");
    expect(timing?.leaveBy).toBeNull();
  });

  it("offers a set-off reminder half an hour before the slot", () => {
    const timing = describeVisitTiming(scheduled(), istMorning("2026-09-01"));

    expect(timing?.leaveBy).toBe("7:30 am");
  });

  it("has nothing to describe while the slot is only held", () => {
    expect(describeVisitTiming(scheduled({ scheduled_for: null }), Date.now())).toBeNull();
  });

  it("falls back to the browser's zone rather than throwing on one it cannot resolve", () => {
    const timing = describeVisitTiming(
      scheduled({ timezone: "Mars/Olympus_Mons" }),
      istMorning("2026-09-01"),
    );

    expect(timing?.zoneUnsupported).toBe(true);
    expect(timing?.timeLabel).not.toBe("");
  });
});

describe("zone helpers", () => {
  it("keys a day by the site's calendar, not UTC's", () => {
    // 19:00 UTC on the 1st is 00:30 IST on the 2nd.
    expect(dayKeyInZone(Date.parse("2026-09-01T19:00:00Z"), "Asia/Kolkata")).toBe("2026-09-02");
    expect(dayKeyInZone(Date.parse("2026-09-01T19:00:00Z"), "UTC")).toBe("2026-09-01");
  });

  it("formats an instant without repeating its date", () => {
    expect(timeOnlyInZone(VISIT_AT, "Asia/Kolkata")).toBe("8:00 am");
  });
});
