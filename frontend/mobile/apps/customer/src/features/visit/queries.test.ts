// Ported from frontend/apps/customer/features/visit/queries.test.ts
import {
  canCancel,
  canRequestStartOtp,
  canRespondToCompletion,
  canReschedule,
  isVisitSettled,
  rescheduleBlockedReason,
  isVisitTerminal,
  type Visit,
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

function visit(status: VisitStatus): Visit {
  return { status } as Visit;
}

function reschedulable(base: Visit): Visit {
  return {
    ...base,
    reschedule_preview: {
      is_available: true,
      unavailable_reason: "",
      earliest_start: "2026-08-09T10:00:00+05:30",
    },
  } as Visit;
}

function blocked(base: Visit, reason: string): Visit {
  return {
    ...base,
    reschedule_preview: {
      is_available: false,
      unavailable_reason: reason,
      earliest_start: "2026-08-09T10:00:00+05:30",
    },
  } as Visit;
}

describe("what a customer may do", () => {
  it("offers cancel for every status the server still accepts one from", () => {
    const cancellable = ALL_STATUSES.filter((status) => canCancel(visit(status)));

    expect(cancellable).toEqual(["CONFIRMED", "EN_ROUTE", "ARRIVED", "RECOVERY_REQUIRED"]);
  });

  it("never offers cancel once the visit is over", () => {
    for (const status of ["COMPLETED", "PARTIALLY_COMPLETED", "DISPUTED", "CANCELLED"] as const) {
      expect(canCancel(visit(status))).toBe(false);
    }
  });

  it("never offers cancel while work is happening", () => {
    expect(canCancel(visit("IN_PROGRESS"))).toBe(false);
    expect(canCancel(visit("COMPLETION_SUBMITTED"))).toBe(false);
    expect(canCancel(visit("ABORTED"))).toBe(false);
  });

  it("offers reschedule only when the server says it is on offer", () => {
    expect(canReschedule(reschedulable(visit("CONFIRMED")))).toBe(true);
    expect(canReschedule(blocked(visit("CONFIRMED"), "Too close to the visit."))).toBe(false);
  });

  it("surfaces the server's own reason when reschedule is refused", () => {
    const tooClose = blocked(visit("CONFIRMED"), "Too close to the visit.");

    expect(rescheduleBlockedReason(tooClose)).toBe("Too close to the visit.");
    expect(rescheduleBlockedReason(reschedulable(visit("CONFIRMED")))).toBe("");
  });

  it("never offers reschedule when the server sent no answer at all", () => {
    for (const status of ALL_STATUSES) {
      expect(canReschedule(visit(status))).toBe(false);
    }
  });

  it("only offers the start code once the professional is there", () => {
    const withCode = ALL_STATUSES.filter((status) => canRequestStartOtp(visit(status)));

    expect(withCode).toEqual(["ARRIVED"]);
  });

  it("only offers confirm/dispute against a report that exists", () => {
    const respondable = ALL_STATUSES.filter((status) => canRespondToCompletion(visit(status)));

    expect(respondable).toEqual(["COMPLETION_SUBMITTED"]);
  });
});

describe("when polling stops", () => {
  it("keeps watching while the server can still move the visit on its own", () => {
    for (const status of ["CONFIRMED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"] as const) {
      expect(isVisitSettled(visit(status))).toBe(false);
    }
  });

  it("stops once only a person can move it", () => {
    expect(isVisitSettled(visit("COMPLETION_SUBMITTED"))).toBe(true);
    expect(isVisitSettled(visit("RECOVERY_REQUIRED"))).toBe(true);
  });

  it("separates settled-for-polling from actually over", () => {
    expect(isVisitSettled(visit("COMPLETION_SUBMITTED"))).toBe(true);
    expect(isVisitTerminal(visit("COMPLETION_SUBMITTED"))).toBe(false);

    for (const status of ["COMPLETED", "PARTIALLY_COMPLETED", "DISPUTED", "CANCELLED"] as const) {
      expect(isVisitTerminal(visit(status))).toBe(true);
    }
  });

  it("treats an aborted visit as still moving", () => {
    expect(isVisitSettled(visit("ABORTED"))).toBe(false);
  });
});

