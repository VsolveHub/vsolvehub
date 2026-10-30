import { createTranslator } from "@vsolve/ui";
import { describe, expect, it } from "vitest";

import type { EngagementStage } from "@/features/engagement/queries";
import { catalogs } from "@/i18n/catalogs";

import {
  collectedDirectlyPaise,
  dayChipDate,
  describeShiftDay as describeShiftDayWith,
  nextCrewAction as nextCrewActionWith,
  settledDayCount,
  type ShiftSummary,
} from "./day-chip";

const { t } = createTranslator("en-IN", catalogs["en-IN"]);
const describeShiftDay = (summary: ShiftSummary) => describeShiftDayWith(summary, t);
const nextCrewAction = (stages: readonly EngagementStage[]) => nextCrewActionWith(stages, t);

/**
 * The day-chip derivation the spec fixes for both apps, from
 * `EngagementStage.shift_summary` (contract 1.49.0).
 */

function summary(overrides: Partial<ShiftSummary> = {}): ShiftSummary {
  return {
    crew_named: 0,
    expected_count: 5,
    arrived_at: null,
    present_count: null,
    attendance_status: "PENDING",
    settlement_status: "",
    settlement_amount_paise: null,
    shortfall_choice: "",
    ...overrides,
  };
}

function stage(overrides: Partial<EngagementStage> = {}): EngagementStage {
  return {
    id: "s1",
    position: 1,
    label: "Day 1",
    amount_paise: 300_000,
    funding_breakdown: null,
    shift_summary: summary(),
    kind: "WORK",
    starts_on: null,
    duration_days: 1,
    // A Monday.
    scheduled_on: "2026-09-07",
    status: "PENDING",
    funding_state: "NOT_REQUIRED",
    funded_paise: 0,
    approved_amount_paise: 0,
    released_amount_paise: 0,
    refunded_amount_paise: 0,
    correction_note: "",
    dispute_reason_code: "",
    review_due_at: null,
    payout_release_due_at: null,
    evidence: [],
    funded_at: null,
    started_at: null,
    evidence_submitted_at: null,
    approved_at: null,
    released_at: null,
    disputed_at: null,
    ...overrides,
  };
}

describe("describeShiftDay", () => {
  it("asks for the crew before anything else", () => {
    expect(describeShiftDay(summary()).label).toBe("Name crew");
  });

  it("says the crew is named until somebody arrives", () => {
    expect(describeShiftDay(summary({ crew_named: 4 })).label).toBe("Crew named");
  });

  it("says reached once arrival is recorded and no count is in", () => {
    expect(
      describeShiftDay(summary({ crew_named: 5, arrived_at: "2026-09-07T03:30:00Z" })).label,
    ).toBe("Reached");
  });

  it("shows the supervisor's count while the customer has not answered", () => {
    expect(
      describeShiftDay(
        summary({ crew_named: 5, present_count: 4, attendance_status: "SUPERVISOR_CONFIRMED" }),
      ).label,
    ).toBe("4 of 5 · waiting for customer");
  });

  it("waits for the customer once the lead has claimed payment", () => {
    expect(
      describeShiftDay(
        summary({
          attendance_status: "CUSTOMER_CONFIRMED",
          settlement_status: "SUPERVISOR_CLAIMED",
        }),
      ).label,
    ).toBe("Waiting for customer to confirm payment");
  });

  it("asks the lead to confirm when the customer says they paid", () => {
    expect(
      describeShiftDay(
        summary({ attendance_status: "CUSTOMER_CONFIRMED", settlement_status: "CUSTOMER_CLAIMED" }),
      ).label,
    ).toBe("Customer says paid — confirm");
  });

  it("says paid with the amount only at SETTLED", () => {
    const chip = describeShiftDay(
      summary({
        attendance_status: "CUSTOMER_CONFIRMED",
        settlement_status: "SETTLED",
        settlement_amount_paise: 320_000,
      }),
    );
    expect(chip.label).toBe("Paid ✓ ₹3,200");
    expect(chip.settled).toBe(true);
  });

  it("names a dispute as a dispute", () => {
    expect(describeShiftDay(summary({ attendance_status: "DISPUTED" })).label).toBe(
      "Count disputed",
    );
  });

  it("never says the word unproven", () => {
    for (const status of ["", "AWAITING_BOTH", "SUPERVISOR_CLAIMED", "CUSTOMER_CLAIMED", "SETTLED"]) {
      const chip = describeShiftDay(
        summary({ attendance_status: "CUSTOMER_CONFIRMED", settlement_status: status }),
      );
      expect(chip.label.toLowerCase()).not.toContain("unproven");
    }
  });
});

describe("nextCrewAction", () => {
  it("points at the first unsettled day and names what it needs", () => {
    const next = nextCrewAction([
      stage({
        id: "done",
        position: 1,
        shift_summary: summary({ settlement_status: "SETTLED" }),
      }),
      stage({ id: "today", position: 2, scheduled_on: "2026-09-08" }),
      stage({ id: "later", position: 3, scheduled_on: "2026-09-09" }),
    ]);

    expect(next?.stageId).toBe("today");
    expect(next?.label).toBe("Name Tuesday's crew");
  });

  it("skips a cancelled day", () => {
    const next = nextCrewAction([
      stage({ id: "off", position: 1, status: "CANCELLED" }),
      stage({ id: "on", position: 2, scheduled_on: "2026-09-08", shift_summary: summary({ crew_named: 5 }) }),
    ]);

    expect(next?.stageId).toBe("on");
    expect(next?.label).toBe("Tuesday: we've reached");
  });

  it("is nothing once every day is settled", () => {
    expect(
      nextCrewAction([stage({ shift_summary: summary({ settlement_status: "SETTLED" }) })]),
    ).toBeNull();
  });

  it("ignores project stages, which carry no summary", () => {
    expect(nextCrewAction([stage({ shift_summary: null })])).toBeNull();
  });
});

describe("collectedDirectlyPaise", () => {
  it("sums only the settled days", () => {
    expect(
      collectedDirectlyPaise([
        stage({ shift_summary: summary({ settlement_status: "SETTLED", settlement_amount_paise: 320_000 }) }),
        stage({ shift_summary: summary({ settlement_status: "SETTLED", settlement_amount_paise: 300_000 }) }),
        stage({ shift_summary: summary({ settlement_status: "CUSTOMER_CLAIMED", settlement_amount_paise: 300_000 }) }),
      ]),
    ).toBe(620_000);
  });

  it("is null rather than zero when nothing has settled", () => {
    expect(collectedDirectlyPaise([stage(), stage({ shift_summary: null })])).toBeNull();
  });
});

describe("settledDayCount", () => {
  it("counts settled days against the total, the WORK stack's Day X of Y chip", () => {
    expect(
      settledDayCount([
        stage({ id: "s1", shift_summary: summary({ settlement_status: "SETTLED" }) }),
        stage({ id: "s2", shift_summary: summary({ settlement_status: "SUPERVISOR_CLAIMED" }) }),
        stage({ id: "s3", shift_summary: summary({ settlement_status: "SUPERVISOR_CLAIMED" }) }),
      ]),
    ).toEqual({ settled: 1, total: 3 });
  });

  it("drops a cancelled stage from the total rather than counting work never done", () => {
    expect(
      settledDayCount([
        stage({ id: "s1", shift_summary: summary({ settlement_status: "SETTLED" }) }),
        stage({ id: "s2", status: "CANCELLED", shift_summary: summary({ settlement_status: "SETTLED" }) }),
      ]),
    ).toEqual({ settled: 1, total: 1 });
  });

  it("reads no stages as nothing settled and nothing to do", () => {
    expect(settledDayCount([])).toEqual({ settled: 0, total: 0 });
  });
});

describe("dayChipDate", () => {
  it("reads a bare date as a local day, not UTC midnight", () => {
    expect(dayChipDate("2026-09-07")).toBe("Mon 7");
  });

  it("is null when the stage has no date", () => {
    expect(dayChipDate(null)).toBeNull();
  });
});
