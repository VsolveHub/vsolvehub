import { describe, expect, it } from "vitest";

import type { RequirementQuestionView } from "@/features/requirement/adapters";
import {
  crewDetailQuestions,
  hiddenCrewQuestionCodes,
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

describe("crew booking flow", () => {
  it("keeps the server's work question on the first step and every other question on details", () => {
    expect(workTypeQuestion(questions)?.label).toBe("What will they be doing?");
    expect(crewDetailQuestions(questions).map((question) => question.code)).toEqual([
      "worker_count",
      "duration_days",
      "work_description",
    ]);
  });

  it("resumes a recognised saved choice at crew planning", () => {
    const work = workTypeQuestion(questions);
    expect(resumeCrewBookingStep(work, { work_type: "loading-unloading" })).toBe("details");
    expect(selectedWorkLabel(work, { work_type: "loading-unloading" })).toBe(
      "Loading and unloading",
    );
  });

  it("returns to work selection for missing or stale saved values", () => {
    const work = workTypeQuestion(questions);
    expect(resumeCrewBookingStep(work, {})).toBe("work");
    expect(resumeCrewBookingStep(work, { work_type: "retired-option" })).toBe("work");
  });

  it("shows free text only behind Something else", () => {
    expect(hiddenCrewQuestionCodes({ work_type: "loading-unloading" })).toEqual([
      "work_description",
    ]);
    expect(hiddenCrewQuestionCodes({ work_type: "other" })).toEqual([]);
  });
});
