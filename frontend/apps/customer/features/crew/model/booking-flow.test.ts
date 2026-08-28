import { describe, expect, it } from "vitest";

import type { RequirementQuestionView } from "@/features/requirement/adapters";
import {
  crewDetailQuestions,
  crewFlowShape,
  hiddenCrewQuestionCodes,
  initialCrewBookingStep,
  resumeCrewBookingStep,
  selectedWorkLabel,
  workTypeQuestion,
} from "./booking-flow";

const questions: readonly RequirementQuestionView[] = [
  {
    code: "work_type",
    label: "What will they be doing?",
    kind: "choice",
    required: true,
    options: [
      { value: "loading-unloading", label: "Loading and unloading" },
      { value: "other", label: "Something else" },
    ],
  },
  { code: "worker_count", label: "People", kind: "number", required: true, minimum: 1 },
  { code: "duration_days", label: "Days", kind: "number", required: true, minimum: 1 },
  { code: "work_description", label: "Tell us what the work is", kind: "text", required: false },
];

/** A specific day-hire — "Electrician by the day" — publishes only the sizing questions. */
const plainQuestions = questions.filter((question) => question.kind === "number");

const eventQuestions: readonly RequirementQuestionView[] = [
  {
    code: "event_type",
    label: "What's the occasion?",
    kind: "choice",
    required: true,
    options: [{ value: "wedding", label: "Wedding" }],
  },
  {
    code: "guest_band",
    label: "How many guests?",
    kind: "choice",
    required: true,
    options: [{ value: "100-200", label: "100 to 200" }],
  },
  {
    code: "service_style",
    label: "How is food served?",
    kind: "choice",
    required: true,
    options: [{ value: "buffet", label: "Buffet" }],
  },
  { code: "waiter_count", label: "Waiters", kind: "number", required: false, minimum: 0 },
  { code: "worker_count", label: "Staff", kind: "number", required: true, minimum: 1 },
  { code: "duration_days", label: "Days", kind: "number", required: true, minimum: 1 },
];

describe("crew booking flow", () => {
  it("keeps the server's work question on the first step and every other question on details", () => {
    expect(workTypeQuestion(questions)?.label).toBe("What will they be doing?");
    expect(crewDetailQuestions(questions).map((question) => question.code)).toEqual([
      "worker_count",
      "duration_days",
      "work_description",
    ]);
  });

  it("reads the flow's shape off the published questions", () => {
    expect(crewFlowShape(questions)).toBe("work");
    expect(crewFlowShape(plainQuestions)).toBe("plain");
    expect(crewFlowShape(eventQuestions)).toBe("event");
  });

  it("resumes a recognised saved choice at crew planning", () => {
    expect(resumeCrewBookingStep(questions, { work_type: "loading-unloading" })).toBe("details");
    expect(selectedWorkLabel(workTypeQuestion(questions), { work_type: "loading-unloading" })).toBe(
      "Loading and unloading",
    );
  });

  it("returns to work selection for missing or stale saved values", () => {
    expect(resumeCrewBookingStep(questions, {})).toBe("work");
    expect(resumeCrewBookingStep(questions, { work_type: "retired-option" })).toBe("work");
  });

  it("skips the work picker entirely when the catalogue asks no work question", () => {
    // The customer answered "what work?" by choosing the service, so the flow
    // must open on planning and never resume back into a picker that has
    // nothing to pick.
    expect(initialCrewBookingStep(plainQuestions)).toBe("details");
    expect(resumeCrewBookingStep(plainQuestions, {})).toBe("details");
    expect(initialCrewBookingStep(questions)).toBe("work");
  });

  it("opens an event crew on the occasion and resumes at the first unfinished stage", () => {
    expect(initialCrewBookingStep(eventQuestions)).toBe("occasion");
    expect(resumeCrewBookingStep(eventQuestions, {})).toBe("occasion");
    expect(resumeCrewBookingStep(eventQuestions, { event_type: "retired" })).toBe("occasion");
    const occasion = { event_type: "wedding", guest_band: "100-200", service_style: "buffet" };
    expect(resumeCrewBookingStep(eventQuestions, occasion)).toBe("crew");
    expect(resumeCrewBookingStep(eventQuestions, { ...occasion, waiter_count: 6 })).toBe("details");
  });

  it("shows free text only behind Something else", () => {
    expect(hiddenCrewQuestionCodes({ work_type: "loading-unloading" })).toEqual([
      "work_description",
    ]);
    expect(hiddenCrewQuestionCodes({ work_type: "other" })).toEqual([]);
  });
});
