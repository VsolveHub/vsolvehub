import { describe, expect, it } from "vitest";

import type { RequirementQuestionView } from "@/features/requirement/adapters";
import {
  applyServingSuggestion,
  crewMixLabel,
  hiddenEventQuestionCodes,
  isEventCrewFlow,
  occasionQuestions,
  presentationQuestions,
  roleQuestions,
  suggestedServers,
  syncHeadcount,
  withRoleCount,
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
  { code: "staff_preference", label: "Staff preference", kind: "choice", required: false, options: [] },
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
    expect(presentationQuestions(questions).map((q) => q.code)).toEqual([
      "dress_code",
      "staff_meal_provided",
      "staff_preference",
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

  it("suggests a serving headcount from the crowd and the service style, and nothing otherwise", () => {
    expect(suggestedServers("100-200", "buffet")).toBe(5);
    expect(suggestedServers("100-200", "sit-down")).toBe(10);
    expect(suggestedServers("under-50", "passed")).toBe(2);
    expect(suggestedServers("100-200", "no-food")).toBeNull();
    expect(suggestedServers(undefined, "buffet")).toBeNull();
    expect(suggestedServers("a-band-this-build-does-not-know", "buffet")).toBeNull();
  });
});
