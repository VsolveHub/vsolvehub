// Ported from frontend/apps/partner/features/work/queries.test.ts

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

/** A visit whose clocked steps the server has opened, so only the status decides. */
function visit(status: VisitStatus): PartnerVisit {
  return { status, allowed_actions: ["MARK_EN_ROUTE", "MARK_ARRIVED"] } as unknown as PartnerVisit;
}

const GATES = {
  address_unlocks_at: "2026-11-06T06:30:00Z",
  en_route_opens_at: "2026-11-06T07:30:00Z",
  en_route_closes_at: "2026-11-06T10:00:00Z",
  arrival_opens_at: "2026-11-06T08:00:00Z",
  arrival_closes_at: "2026-11-06T10:00:00Z",
};

function gated(status: VisitStatus, allowed: string[]): PartnerVisit {
  return { status, allowed_actions: allowed, gates: GATES } as unknown as PartnerVisit;
}

describe("the one forward action available at each step", () => {
  it("offers exactly one primary move per state", () => {
    // `ALLOWED_TRANSITIONS` permits one forward move from each state, so the
    // primary button is singular by construction rather than by layout choice.
    // Two enabled at once would mean the machine and the screen disagree.
    for (const status of ALL_STATUSES) {
      const forward = [canGoEnRoute, canArrive, canStartWork].filter((can) => can(visit(status)));

      expect(forward.length).toBeLessThan(2);
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

describe("the server's clock on the way and on arrival", () => {
  it("does not offer I am on my way until the server opens it", () => {
    // The bug as reported: the button showed a day early and the tap answered "too early".
    expect(canGoEnRoute(gated("CONFIRMED", []))).toBe(false);
    expect(canGoEnRoute(gated("CONFIRMED", ["MARK_EN_ROUTE"]))).toBe(true);
  });

  it("says when the step opens instead", () => {
    const before = Date.parse("2026-11-06T05:00:00Z");
    expect(waitingGate(gated("CONFIRMED", []), before)).toEqual({
      action: "MARK_EN_ROUTE",
      state: "not_yet",
      opensAt: GATES.en_route_opens_at,
      closesAt: GATES.en_route_closes_at,
    });
  });

  it("asks again once the clock passes the opening, and reports a closed window", () => {
    expect(waitingGate(gated("CONFIRMED", []), Date.parse("2026-11-06T07:45:00Z"))?.state).toBe("opening");
    expect(waitingGate(gated("EN_ROUTE", []), Date.parse("2026-11-06T11:00:00Z"))?.state).toBe("closed");
  });

  it("has nothing to wait for once the step is open", () => {
    expect(waitingGate(gated("CONFIRMED", ["MARK_EN_ROUTE"]), Date.parse("2026-11-06T07:45:00Z"))).toBeNull();
  });
});
