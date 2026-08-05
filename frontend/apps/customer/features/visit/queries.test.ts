import { describe, expect, it } from "vitest";

import {
  canCancel,
  canRequestStartOtp,
  canRespondToCompletion,
  canReschedule,
  isVisitSettled,
  isVisitTerminal,
  type Visit,
  type VisitStatus,
} from "./queries";

/**
 * The predicates that decide which screen a customer sees.
 *
 * They are allowed to be wrong in exactly one direction — offering an action
 * Django refuses costs a typed error, while hiding one Django would allow
 * strands the customer with no way forward. These tests pin the direction.
 */

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

describe("what a customer may do", () => {
  it("offers cancel for every status the server still accepts one from", () => {
    // Mirrors `CUSTOMER_CANCELLABLE_STATUSES`. `RECOVERY_REQUIRED` is included:
    // a customer whose professional stepped back must be able to leave rather
    // than wait. Django adds the condition this cannot see — a release *after*
    // work started leaves performed work to settle — and refuses those.
    const cancellable = ALL_STATUSES.filter((status) => canCancel(visit(status)));

    expect(cancellable).toEqual(["CONFIRMED", "EN_ROUTE", "ARRIVED", "RECOVERY_REQUIRED"]);
  });

  it("never offers cancel once the visit is over", () => {
    for (const status of ["COMPLETED", "PARTIALLY_COMPLETED", "DISPUTED", "CANCELLED"] as const) {
      expect(canCancel(visit(status))).toBe(false);
    }
  });

  it("never offers cancel while work is happening", () => {
    // The money is settled through the completion report at this point, not by
    // walking away from it.
    expect(canCancel(visit("IN_PROGRESS"))).toBe(false);
    expect(canCancel(visit("COMPLETION_SUBMITTED"))).toBe(false);
    expect(canCancel(visit("ABORTED"))).toBe(false);
  });

  it("only offers reschedule before the visit starts", () => {
    const reschedulable = ALL_STATUSES.filter((status) => canReschedule(visit(status)));

    expect(reschedulable).toEqual(["CONFIRMED", "EN_ROUTE"]);
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
    // `COMPLETION_SUBMITTED` is the interesting one: far from finished, but the
    // ball is with the customer, and the watchdog that eventually finalizes it
    // runs a day out. Re-reading on a five-second timer asks the server a
    // question only the customer can answer.
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
    // Abort is not an ending: the professional still has to report line-level
    // outcomes, and the server moves it on when they do.
    expect(isVisitSettled(visit("ABORTED"))).toBe(false);
  });
});
