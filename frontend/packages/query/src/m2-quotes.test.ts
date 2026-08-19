import { describe, expect, it } from "vitest";

import { isVisitPlanSettled, type VisitPlanState } from "./m2-quotes";

function visitPlanState(status: string | null): VisitPlanState {
  return {
    plan:
      status === null
        ? null
        : {
            id: "plan-1",
            requirement: "req-1",
            plan_size: 1,
            status,
            price_paise: 100_000,
            credit_paise: 0,
            chargeable_paise: 100_000,
            platform_fee_paise: 10_000,
            tax_paise: 0,
            payment_attempt: null,
            fill_due_at: null,
            chosen_at: "2026-08-16T10:00:00Z",
            charged_at: null,
            settled_at: null,
            shares: [],
          },
    available_tiers: [],
    visits: [],
    checkout_available: false,
    can_read_full_estimates: false,
    server_now: "2026-08-16T10:00:00Z",
  } as VisitPlanState;
}

describe("visit plan polling", () => {
  it("keeps observing a chosen plan because a partner can still confirm a slot", () => {
    expect(isVisitPlanSettled(visitPlanState("CHOSEN"))).toBe(false);
  });

  it("keeps observing a pending plan until the payment callback lands", () => {
    expect(isVisitPlanSettled(visitPlanState("PENDING"))).toBe(false);
  });

  it("stops once the plan has a terminal or active answer", () => {
    expect(isVisitPlanSettled(visitPlanState(null))).toBe(true);
    expect(isVisitPlanSettled(visitPlanState("ACTIVE"))).toBe(true);
    expect(isVisitPlanSettled(visitPlanState("FAILED"))).toBe(true);
    expect(isVisitPlanSettled(visitPlanState("VOID"))).toBe(true);
    expect(isVisitPlanSettled(visitPlanState("SETTLED"))).toBe(true);
  });
});
