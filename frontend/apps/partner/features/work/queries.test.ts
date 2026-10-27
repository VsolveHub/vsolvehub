import { describe, expect, it } from "vitest";

import {
  canAbort,
  canArrive,
  canGoEnRoute,
  canRelease,
  canReportCompletion,
  canStartWork,
  isSettled,
  waitingGate,
  type PartnerVisit,
  type VisitStatus,
} from "./queries";

const ALL_STATUSES: VisitStatus[] = [
  "CONFIRMED",
  "EN_ROUTE",
  "ARRIVED",
  "IN_PROGRESS",
  "COMPLETION_SUBMITTED",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "DISPUTED",
  "ABORTED",
  "RECOVERY_REQUIRED",
  "CANCELLED",
];

const EVERY_ACTION: PartnerVisit["allowed_actions"] = [
  "MARK_EN_ROUTE",
  "MARK_ARRIVED",
  "CUSTOMER_UNAVAILABLE_WAIT_STARTED",
  "START_WORK",
  "ABORT_WORK",
  "SUBMIT_COMPLETION",
  "PARTNER_RELEASE",
];

const GATES: PartnerVisit["gates"] = {
  address_unlocks_at: "2026-08-20T07:00:00Z",
  en_route_opens_at: "2026-08-20T08:00:00Z",
  en_route_closes_at: "2026-08-20T10:30:00Z",
  arrival_opens_at: "2026-08-20T08:30:00Z",
  arrival_closes_at: "2026-08-20T10:30:00Z",
};

/** Every clock open by default, so the status rules below are tested on their own. */
function visit(
  status: VisitStatus,
  allowed: PartnerVisit["allowed_actions"] = EVERY_ACTION,
): PartnerVisit {
  return { status, allowed_actions: allowed, gates: GATES } as PartnerVisit;
}

describe("the one forward action available at each step", () => {
  it("offers exactly one primary move per state", () => {
    // `ALLOWED_TRANSITIONS` permits one forward move from each state, so the
    // primary button is singular by construction rather than by layout choice.
    // Two enabled at once would mean the machine and the screen disagree.
    for (const status of ALL_STATUSES) {
      const forward = [canGoEnRoute, canArrive, canStartWork].filter((can) => can(visit(status)));

      expect(forward.length, `${status} offers ${forward.length} forward actions`).toBeLessThan(2);
    }
  });

  it("walks the visit in order", () => {
    expect(ALL_STATUSES.filter((s) => canGoEnRoute(visit(s)))).toEqual(["CONFIRMED"]);
    expect(ALL_STATUSES.filter((s) => canArrive(visit(s)))).toEqual(["EN_ROUTE"]);
    expect(ALL_STATUSES.filter((s) => canStartWork(visit(s)))).toEqual(["ARRIVED"]);
  });
});

describe("reporting and stopping", () => {
  it("accepts a completion report while working and after an abort", () => {
    // Abort is not an ending. Completed lines are still owed to the Partner, so
    // the report is exactly how an aborted job settles.
    expect(ALL_STATUSES.filter((s) => canReportCompletion(visit(s)))).toEqual([
      "IN_PROGRESS",
      "ABORTED",
    ]);
  });

  it("only offers abort once work has actually started", () => {
    expect(ALL_STATUSES.filter((s) => canAbort(visit(s)))).toEqual(["IN_PROGRESS"]);
  });

  it("offers release right up to the point work starts, and never after", () => {
    expect(ALL_STATUSES.filter((s) => canRelease(visit(s)))).toEqual([
      "CONFIRMED",
      "EN_ROUTE",
      "ARRIVED",
    ]);
    // Handing back a job mid-work would leave performed lines unsettled; that
    // path is Abort plus a report, not release.
    expect(canRelease(visit("IN_PROGRESS"))).toBe(false);
  });
});

describe("polling", () => {
  it("keeps watching while the server can still move the job", () => {
    for (const status of ["CONFIRMED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "ABORTED"] as const) {
      expect(isSettled(visit(status))).toBe(false);
    }
  });

  it("stops once the job is waiting on somebody else", () => {
    for (const status of [
      "COMPLETION_SUBMITTED",
      "COMPLETED",
      "PARTIALLY_COMPLETED",
      "DISPUTED",
      "CANCELLED",
      "RECOVERY_REQUIRED",
    ] as const) {
      expect(isSettled(visit(status))).toBe(true);
    }
  });
});

describe("the clocked steps follow the server, not the device", () => {
  it("does not offer a step the server has not opened, whatever the status", () => {
    expect(canGoEnRoute(visit("CONFIRMED", ["PARTNER_RELEASE"]))).toBe(false);
    expect(canArrive(visit("EN_ROUTE", ["PARTNER_RELEASE"]))).toBe(false);
  });

  it("names the waiting step and when it opens", () => {
    const early = Date.parse("2026-08-20T07:59:59Z");

    expect(waitingGate(visit("CONFIRMED", ["PARTNER_RELEASE"]), early)).toEqual({
      action: "MARK_EN_ROUTE",
      state: "not_yet",
      opensAt: GATES.en_route_opens_at,
      closesAt: GATES.en_route_closes_at,
    });
  });

  it("asks for a refetch once the clock reaches a window this read predates", () => {
    const opened = Date.parse("2026-08-20T08:30:00Z");

    expect(waitingGate(visit("EN_ROUTE", ["PARTNER_RELEASE"]), opened)?.state).toBe("opening");
  });

  it("reports a window that has closed", () => {
    const late = Date.parse("2026-08-20T10:30:01Z");

    expect(waitingGate(visit("EN_ROUTE", ["PARTNER_RELEASE"]), late)?.state).toBe("closed");
  });

  it("waits on nothing once the step is open or past", () => {
    const now = Date.parse("2026-08-20T08:45:00Z");

    expect(waitingGate(visit("CONFIRMED"), now)).toBeNull();
    expect(waitingGate(visit("ARRIVED", ["START_WORK"]), now)).toBeNull();
  });
});
