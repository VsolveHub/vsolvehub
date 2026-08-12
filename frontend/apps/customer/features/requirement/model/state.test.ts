import { describe, expect, it } from "vitest";

import { requirementReducer } from "./machine";
import {
  blockedReason,
  canNavigateTo,
  initialDraftState,
  type RequirementDraftState,
} from "./state";

/**
 * The guards between the Customer and a requirement no vendor can quote.
 *
 * The date block is the one worth the most here, and it is new: `_assert_
 * submittable` refuses a requirement without a start ("when it should start"),
 * and `find_probable_duplicate` matches within ±3 days of it — so before the
 * 1.21.0 re-point this flow could reach review, submit, and be refused for a
 * field that was never on any screen.
 */

const TODAY = "2026-08-12";

function draft(overrides: Partial<RequirementDraftState> = {}): RequirementDraftState {
  return { ...initialDraftState("housekeeping-staff"), ...overrides };
}

describe("screen 1 — what", () => {
  it("refuses an untouched form", () => {
    expect(blockedReason(draft(), TODAY)).toBe("REQUIRED_ANSWER_MISSING");
  });

  it("lets a touched form through before the server has said anything", () => {
    // Before the first save there is no verdict, so an empty answer set is the
    // only thing the client can refuse on its own. Validity is the server's.
    expect(blockedReason(draft({ answers: { worker_count: 4 } }), TODAY)).toBeNull();
  });

  it("reads the server's list of missing answers rather than recomputing it", () => {
    const state = draft({
      answers: { worker_count: 4 },
      verdict: {
        lifecycle: "A3_TIME_BLOCK",
        explanation: "You are hiring people for a period of time.",
        missingRequiredAnswers: ["duration_days"],
      },
    });

    expect(blockedReason(state, TODAY)).toBe("REQUIRED_ANSWER_MISSING");
  });
});

describe("screen 2 — where and when", () => {
  const base = { screen: "where_when" as const, addressId: "addr-1" };

  it("refuses without an address", () => {
    expect(blockedReason(draft({ screen: "where_when" }), TODAY)).toBe("ADDRESS_NOT_CHOSEN");
  });

  it("refuses without a start date, which the submit command requires", () => {
    expect(blockedReason(draft(base), TODAY)).toBe("START_DATE_NOT_CHOSEN");
  });

  it("refuses a start date that has already gone", () => {
    const state = draft({ ...base, requestedStart: "2026-08-11" });

    expect(blockedReason(state, TODAY)).toBe("START_DATE_IN_PAST");
  });

  it("refuses without the needed-by date, which is what closes the requirement", () => {
    const state = draft({ ...base, requestedStart: "2026-08-20" });

    expect(blockedReason(state, TODAY)).toBe("SERVICE_DATE_NOT_CHOSEN");
  });

  it("refuses a needed-by date before the work starts", () => {
    // A typo the Customer can see and fix, between two controls on one screen.
    const state = draft({ ...base, requestedStart: "2026-08-20", serviceBy: "2026-08-18" });

    expect(blockedReason(state, TODAY)).toBe("SERVICE_DATE_BEFORE_START");
  });

  it("allows the two dates on the same day", () => {
    // A one-day job is a real requirement, not an error.
    const state = draft({ ...base, requestedStart: "2026-08-20", serviceBy: "2026-08-20" });

    expect(blockedReason(state, TODAY)).toBeNull();
  });

  it("refuses while a duplicate is on screen and unanswered", () => {
    const state = draft({ ...base, requestedStart: "2026-08-20", serviceBy: "2026-08-24" });

    expect(blockedReason(state, TODAY, true)).toBe("DUPLICATE_NOT_RESOLVED");
  });

  it("lets an explicit override through", () => {
    const state = draft({
      ...base,
      requestedStart: "2026-08-20",
      serviceBy: "2026-08-24",
      duplicateOverridden: true,
    });

    expect(blockedReason(state, TODAY, true)).toBeNull();
  });
});

describe("screen 4 — review, where every date guard is re-asserted", () => {
  it("re-checks the dates, because the Customer can go back and change them", () => {
    // The submit guard is the last one. Trusting screen 2 would mean a
    // requirement whose needed-by date was moved before its start after the
    // fact reaches the server.
    const state = draft({
      screen: "review",
      addressId: "addr-1",
      requestedStart: "2026-08-20",
      serviceBy: "2026-08-18",
    });

    expect(blockedReason(state, TODAY)).toBe("SERVICE_DATE_BEFORE_START");
  });

  it("refuses a review with no start date at all", () => {
    const state = draft({ screen: "review", addressId: "addr-1", serviceBy: "2026-08-24" });

    expect(blockedReason(state, TODAY)).toBe("START_DATE_NOT_CHOSEN");
  });
});

describe("navigation", () => {
  it("refuses a jump forward, because a jump skips a guard", () => {
    expect(canNavigateTo(draft(), "review")).toBe(false);
  });

  it("allows going back to a screen already visited", () => {
    const state = draft({ screen: "details", visited: ["what", "where_when"] });

    expect(canNavigateTo(state, "what")).toBe(true);
  });
});

describe("the invalidation cascade", () => {
  it("drops the verdict when an answer changes", () => {
    // The server's sentence and its `missingRequiredAnswers` are both derived
    // from the exact answer set that was sent. Keeping them across an edit
    // gates the Customer on a question set that may no longer apply.
    const state = draft({
      verdict: {
        lifecycle: "A3_TIME_BLOCK",
        explanation: "You are hiring people for a period of time.",
        missingRequiredAnswers: [],
      },
    });

    const next = requirementReducer(state, {
      type: "ANSWER",
      questionCode: "worker_count",
      value: 6,
    });

    expect(next.verdict).toBeNull();
  });

  it("keeps the verdict when a date changes, because dates infer nothing", () => {
    const verdict = {
      lifecycle: "A3_TIME_BLOCK" as const,
      explanation: "You are hiring people for a period of time.",
      missingRequiredAnswers: [],
    };
    const state = draft({ verdict });

    const withStart = requirementReducer(state, {
      type: "SET_REQUESTED_START",
      requestedStart: "2026-08-20",
    });
    const withServiceBy = requirementReducer(withStart, {
      type: "SET_SERVICE_BY",
      serviceBy: "2026-08-24",
    });

    expect(withServiceBy.verdict).toEqual(verdict);
    expect(withServiceBy.requestedStart).toBe("2026-08-20");
  });

  it("records the requirement id even when the server sent no sentence", () => {
    // `lifecycle_explanation` is null for an archetype with no copy. The draft
    // still exists server-side and every later PATCH addresses it, so dropping
    // the id with the missing sentence would strand it.
    const next = requirementReducer(draft(), {
      type: "APPLY_VERDICT",
      verdict: null,
      requirementId: "req-1",
    });

    expect(next.requirementId).toBe("req-1");
    expect(next.verdict).toBeNull();
  });
});
