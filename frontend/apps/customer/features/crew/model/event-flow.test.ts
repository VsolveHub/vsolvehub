import { describe, expect, it } from "vitest";

import type { RequirementQuestionView } from "@/features/requirement/adapters";
import {
  applyServingSuggestion,
  crewGenderTotals,
  crewMixLabel,
  genderMixPhrase,
  hiddenEventQuestionCodes,
  isEventCrewFlow,
  occasionQuestions,
  presentationQuestions,
  roleQuestions,
  splitByGender,
  suggestedServers,
  syncHeadcount,
  withRoleCount,
  withRoleGenderCount,
} from "./event-flow";

const questions: readonly RequirementQuestionView[] = [
  {
    code: "event_type",
    label: "What's the occasion?",
    kind: "choice",
    required: true,
    options: [
      { value: "wedding", label: "Wedding" },
      { value: "other", label: "Something else" },
    ],
  },
  { code: "event_description", label: "Tell us about the event", kind: "text", required: false },
  { code: "guest_band", label: "How many guests?", kind: "choice", required: true, options: [] },
  { code: "service_style", label: "How is food served?", kind: "choice", required: true, options: [] },
  { code: "waiter_count", label: "Waiters and serving staff", kind: "number", required: false, minimum: 0 },
  { code: "bar_staff_count", label: "Bar and beverage staff", kind: "number", required: false, minimum: 0 },
  { code: "worker_count", label: "Staff", kind: "number", required: true, minimum: 1 },
  { code: "duration_days", label: "Days", kind: "number", required: true, minimum: 1 },
  { code: "dress_code", label: "Dress code", kind: "choice", required: true, options: [] },
  { code: "staff_meal_provided", label: "Meal?", kind: "boolean", required: true },
];

describe("event crew flow", () => {
  it("recognises the event shape only when an occasion and at least one role are published", () => {
    expect(isEventCrewFlow(questions)).toBe(true);
    expect(isEventCrewFlow(questions.filter((q) => q.code !== "event_type"))).toBe(false);
    expect(isEventCrewFlow(questions.filter((q) => !q.code.endsWith("_count") || q.code === "worker_count"))).toBe(false);
  });

  it("splits the catalogue's questions across the three screens without touching sizing", () => {
    expect(occasionQuestions(questions).map((q) => q.code)).toEqual([
      "event_type",
      "event_description",
      "guest_band",
      "service_style",
    ]);
    expect(roleQuestions(questions).map((q) => q.code)).toEqual(["waiter_count", "bar_staff_count"]);
    // `staff_preference` is gone at contract 1.53.0 — the per-role steppers ask it properly.
    expect(presentationQuestions(questions).map((q) => q.code)).toEqual([
      "dress_code",
      "staff_meal_provided",
    ]);
  });

  it("keeps the priced headcount equal to the roles chosen", () => {
    const roles = roleQuestions(questions);
    let answers = withRoleCount({ duration_days: 1 }, roles, "waiter_count", 6);
    expect(answers.worker_count).toBe(6);
    answers = withRoleCount(answers, roles, "bar_staff_count", 2);
    expect(answers.worker_count).toBe(8);
    answers = withRoleCount(answers, roles, "waiter_count", -3);
    expect(answers.waiter_count).toBe(0);
    expect(answers.worker_count).toBe(2);
  });

  it("re-derives a restored headcount from the roles rather than trusting storage", () => {
    const roles = roleQuestions(questions);
    expect(syncHeadcount({ waiter_count: 4, worker_count: 99 }, roles).worker_count).toBe(4);
    expect(syncHeadcount({}, roles).worker_count).toBe(0);
  });

  it("describes the mix in the catalogue's words and only for roles with people", () => {
    const roles = roleQuestions(questions);
    expect(crewMixLabel(roles, { waiter_count: 6, bar_staff_count: 2 })).toBe(
      "6 waiters and serving staff · 2 bar and beverage staff",
    );
    expect(crewMixLabel(roles, { waiter_count: 0 })).toBeNull();
  });

  it("shows the free text only behind Something else", () => {
    expect(hiddenEventQuestionCodes({ event_type: "wedding" })).toEqual(["event_description"]);
    expect(hiddenEventQuestionCodes({ event_type: "other" })).toEqual([]);
  });

  it("fills the serving staff from the suggestion, and leaves a hand-set count alone", () => {
    const roles = roleQuestions(questions);
    // Nothing chosen yet: the suggestion lands, and the headcount follows.
    let answers = applyServingSuggestion({ duration_days: 1 }, roles, 5, null);
    expect(answers.waiter_count).toBe(5);
    expect(answers.worker_count).toBe(5);
    // The occasion changes and the count is still the old suggestion: it moves.
    answers = applyServingSuggestion(answers, roles, 10, 5);
    expect(answers.waiter_count).toBe(10);
    // The customer set 7 themselves: a new suggestion does not argue.
    answers = withRoleCount(answers, roles, "waiter_count", 7);
    answers = applyServingSuggestion(answers, roles, 3, 10);
    expect(answers.waiter_count).toBe(7);
    expect(answers.worker_count).toBe(7);
    // No suggestion, no change.
    expect(applyServingSuggestion(answers, roles, null, 3).waiter_count).toBe(7);
  });

  it("splits a serving suggestion across men and women, and totals them", () => {
    expect(splitByGender(3)).toEqual({ men: 2, women: 1 });
    expect(splitByGender(5)).toEqual({ men: 3, women: 2 });
    expect(genderMixPhrase(2, 1)).toBe("2 men · 1 woman");
    expect(genderMixPhrase(1, 0)).toBe("1 man · 0 women");

    const roles = roleQuestions(questions);
    const answers = applyServingSuggestion({ duration_days: 1 }, roles, 3, null);
    expect(answers.waiter_count).toBe(3);
    // The catalogue's own codes, not the invented `waiter_count__men` these used to be:
    // an answer key no schema published, which `validate_scope` would have refused and
    // `crew_brief` could never show the professional.
    expect(answers.waiter_men).toBe(2);
    expect(answers.waiter_women).toBe(1);
    expect(crewGenderTotals(roles, answers)).toEqual({ men: 2, women: 1, people: 3 });

    const adjusted = withRoleGenderCount(answers, roles, "waiter_count", "women", 2);
    expect(adjusted.waiter_count).toBe(4);
    expect(adjusted.worker_count).toBe(4);
    expect(crewGenderTotals(roles, adjusted)).toEqual({ men: 2, women: 2, people: 4 });
  });

  it("suggests a serving headcount from the crowd and the service style, and nothing otherwise", () => {
    expect(suggestedServers("100-200", "buffet")).toBe(5);
    expect(suggestedServers("100-200", "sit-down")).toBe(10);
    expect(suggestedServers("under-50", "passed")).toBe(2);
    expect(suggestedServers("100-200", "no-food")).toBeNull();
    expect(suggestedServers(undefined, "buffet")).toBeNull();
    expect(suggestedServers("a-band-this-build-does-not-know", "buffet")).toBeNull();
  });
});

/**
 * A draft saved by the pre-1.53.0 build is still in somebody's browser storage, holding
 * `waiter_count__men` keys the catalogue never published. Submitting one now earns a refusal
 * naming a question that does not exist, so the restore path drops them.
 */
describe("drafts restored from before the catalogue owned the split", () => {
  it("drops the invented keys and re-derives the split from the role totals", () => {
    const roles = roleQuestions(questions);

    const restored = syncHeadcount(
      { duration_days: 1, waiter_count: 3, waiter_count__men: 2, waiter_count__women: 1 },
      roles,
    );

    expect(restored.waiter_count__men).toBeUndefined();
    expect(restored.waiter_count__women).toBeUndefined();
    // The count survives, which is what the customer actually typed; the split resets to the
    // single-number shape and they re-set it on the screen they are already looking at.
    expect(restored.waiter_count).toBe(3);
    expect(restored.worker_count).toBe(3);
  });
});
