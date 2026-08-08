import { describe, expect, it } from "vitest";

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

/** A visit Django says may be moved. */
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

/** A visit Django refuses to move, with the sentence it refuses with. */
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

  it("offers reschedule only when the server says it is on offer", () => {
    // Not derived from the status, and this is the case that proves why it cannot be. A visit
    // fourteen hours out is `CONFIRMED` and still unreschedulable: Django refuses once the
    // visit is inside its fee-bearing cancellation band, read from the frozen quote-time
    // ladder that never reaches the browser. Reading the status alone opened a slot picker in
    // which every slot would have been refused on submit.
    expect(canReschedule(reschedulable(visit("CONFIRMED")))).toBe(true);
    expect(canReschedule(blocked(visit("CONFIRMED"), "Too close to the visit."))).toBe(false);
  });

  it("surfaces the server's own reason when reschedule is refused", () => {
    const tooClose = blocked(visit("CONFIRMED"), "Too close to the visit.");

    expect(rescheduleBlockedReason(tooClose)).toBe("Too close to the visit.");
    expect(rescheduleBlockedReason(reschedulable(visit("CONFIRMED")))).toBe("");
  });

  it("never offers reschedule when the server sent no answer at all", () => {
    // A visit with no `reschedule_preview` — a Booking with no Fulfilment Unit — is a question
    // Django declined to answer, and the safe reading of silence is "not on offer" rather than
    // a picker whose every slot fails.
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
