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
 * `where_when` is the last screen since the M2-revamp removed review, so its
 * guard is also the submit guard: it re-asserts screen 1's rule as well as its
 * own, because the Customer can go back and change an answer between there and
 * the send.
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

  it("requires every catalogue-required answer when the container names them", () => {
    // One tapped tile out of seven used to unlock Continue. With the required
    // codes in hand the guard can hold the form until each is answered — and
    // an empty multi-select counts as unanswered.
    const required = ["event_type", "decor_areas", "budget_band"];

    expect(
      blockedReason(draft({ answers: { event_type: "wedding" } }), TODAY, false, required),
    ).toBe("REQUIRED_ANSWER_MISSING");
    expect(
      blockedReason(
        draft({ answers: { event_type: "wedding", decor_areas: [], budget_band: "25-50k" } }),
        TODAY,
        false,
        required,
      ),
    ).toBe("REQUIRED_ANSWER_MISSING");
    expect(
      blockedReason(
        draft({
          answers: { event_type: "wedding", decor_areas: ["stage"], budget_band: "25-50k" },
        }),
        TODAY,
        false,
        required,
      ),
    ).toBeNull();
  });

  it("falls back to the touched-form rule when no required codes are known", () => {
    expect(blockedReason(draft({ answers: { worker_count: 4 } }), TODAY, false, [])).toBeNull();
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

  it("refuses without a start date", () => {
    expect(blockedReason(draft(base), TODAY)).toBe("START_DATE_NOT_CHOSEN");
  });
});

describe("screen 3 — visits_send, which is the final submit guard", () => {
  const base = { screen: "visits_send" as const, addressId: "addr-1" };

  it("refuses without an address", () => {
    expect(blockedReason(draft({ screen: "visits_send" }), TODAY)).toBe("ADDRESS_NOT_CHOSEN");
  });

  it("refuses without a start date", () => {
    expect(blockedReason(draft(base), TODAY)).toBe("START_DATE_NOT_CHOSEN");
  });

  it("refuses a start date that has already gone", () => {
    const state = draft({ ...base, requestedStart: "2026-08-11" });

    expect(blockedReason(state, TODAY)).toBe("START_DATE_IN_PAST");
  });

  it("treats an absent deadline as the ordinary answer", () => {
    const state = draft({ ...base, requestedStart: "2026-08-20" });

    expect(blockedReason(state, TODAY)).toBeNull();
  });

  it("refuses a needed-by date before the work starts", () => {
    const state = draft({ ...base, requestedStart: "2026-08-20", serviceBy: "2026-08-18" });

    expect(blockedReason(state, TODAY)).toBe("SERVICE_DATE_BEFORE_START");
  });

  it("allows the two dates on the same day", () => {
    const state = draft({ ...base, requestedStart: "2026-08-20", serviceBy: "2026-08-20" });

    expect(blockedReason(state, TODAY)).toBeNull();
  });

  it("re-asserts screen 1's rule, because the answers can change after leaving it", () => {
    const state = draft({
      ...base,
      requestedStart: "2026-08-20",
      answers: { worker_count: 4 },
      verdict: {
        lifecycle: "A3_TIME_BLOCK",
        explanation: "You are hiring people for a period of time.",
        missingRequiredAnswers: ["duration_days"],
      },
    });

    expect(blockedReason(state, TODAY)).toBe("REQUIRED_ANSWER_MISSING");
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

describe("navigation", () => {
  it("refuses a jump forward, because a jump skips a guard", () => {
    expect(canNavigateTo(draft(), "where_when")).toBe(false);
  });

  it("allows going back to a screen already visited", () => {
    const state = draft({ screen: "where_when", visited: ["what"] });

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
    const flexible = requirementReducer(withStart, {
      type: "SET_FLEXIBILITY_DAYS",
      days: 7,
    });

    expect(flexible.verdict).toEqual(verdict);
    expect(flexible.requestedStart).toBe("2026-08-20");
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

  it("restores the complete editable intent discovered on the server", () => {
    const next = requirementReducer(draft(), {
      type: "RESTORE_SERVER_DRAFT",
      requirementId: "req-existing",
      answers: { worker_count: 5, duration_days: 3 },
      verdict: {
        lifecycle: "A3_TIME_BLOCK",
        explanation: "You are hiring people for a period of time.",
        missingRequiredAnswers: [],
      },
      addressId: "addr-default",
      requestedStart: "2026-08-25",
      serviceBy: "2026-08-28",
      flexibilityDays: 2,
    });

    expect(next).toMatchObject({
      requirementId: "req-existing",
      answers: { worker_count: 5, duration_days: 3 },
      addressId: "addr-default",
      requestedStart: "2026-08-25",
      serviceBy: "2026-08-28",
      flexibilityDays: 2,
    });
  });
});

/**
 * Forward navigation on the desktop brief.
 *
 * `GO_TO` refuses any screen not already in `visited`, which is right for the
 * phone wizard and was wrong for the rail: the rail *is* the navigation, so
 * every forward click was silently refused. `OPEN` is the navigation that
 * answers to the container's guard rather than to `visited`.
 */
describe("OPEN — the brief's own navigation", () => {
  const atWhat = (): RequirementDraftState => ({
    ...initialDraftState("interior-fit-out-project"),
    screen: "what",
    visited: [],
  });

  it("reaches a section the customer has never visited", () => {
    const state = atWhat();

    expect(requirementReducer(state, { type: "GO_TO", screen: "where_when" }).screen).toBe(
      "what",
    );
    expect(requirementReducer(state, { type: "OPEN", screen: "where_when" }).screen).toBe(
      "where_when",
    );
  });

  it("records the screen it leaves, so Back still works from where it lands", () => {
    const next = requirementReducer(atWhat(), { type: "OPEN", screen: "where_when" });

    expect(next.visited).toContain("what");
    expect(requirementReducer(next, { type: "BACK" }).screen).toBe("what");
  });

  it("leaves the per-screen guards alone", () => {
    // Reaching a screen has never been what lets somebody past a rule. An empty
    // draft opened straight at the last screen is still blocked, by the same
    // reason it would have been blocked for on the screen that owns it.
    const opened = requirementReducer(atWhat(), { type: "OPEN", screen: "where_when" });

    expect(blockedReason(opened, TODAY)).not.toBeNull();
  });

  it("ignores a screen that is not in the sequence", () => {
    const state = atWhat();

    expect(
      requirementReducer(state, { type: "OPEN", screen: "nowhere" as never }).screen,
    ).toBe("what");
  });
});
