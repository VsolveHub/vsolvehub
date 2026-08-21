import type { RequirementQuestionView } from "@/features/requirement/adapters";

/**
 * The two catalogue codes that shape the work-first crew flow.
 *
 * The catalogue still owns the labels, descriptions and option order. These
 * codes only express the conditional relationship between its first question
 * and the free-text follow-up behind "Something else".
 */
export const WORK_TYPE_CODE = "work_type";
export const WORK_DESCRIPTION_CODE = "work_description";
export const OTHER_WORK_TYPE = "other";

export type CrewBookingStep = "work" | "details" | "rate";

export function workTypeQuestion(
  questions: readonly RequirementQuestionView[],
): RequirementQuestionView | null {
  return questions.find((question) => question.code === WORK_TYPE_CODE) ?? null;
}

/** All server-published questions except the work picker that owns step one. */
export function crewDetailQuestions(
  questions: readonly RequirementQuestionView[],
): readonly RequirementQuestionView[] {
  return questions.filter((question) => question.code !== WORK_TYPE_CODE);
}

export function selectedWorkValue(
  answers: Readonly<Record<string, unknown>>,
): string | null {
  const value = answers[WORK_TYPE_CODE];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function selectedWorkLabel(
  question: RequirementQuestionView | null,
  answers: Readonly<Record<string, unknown>>,
): string | null {
  const value = selectedWorkValue(answers);
  if (question === null || value === null) return null;
  return question.options?.find((option) => option.value === value)?.label ?? null;
}

/** A restored draft with a recognised work choice resumes at crew planning. */
export function resumeCrewBookingStep(
  question: RequirementQuestionView | null,
  answers: Readonly<Record<string, unknown>>,
): CrewBookingStep {
  return selectedWorkLabel(question, answers) === null ? "work" : "details";
}

/** The free-text follow-up is visible only for the server's `other` option. */
export function hiddenCrewQuestionCodes(
  answers: Readonly<Record<string, unknown>>,
): readonly string[] {
  return answers[WORK_TYPE_CODE] === OTHER_WORK_TYPE ? [] : [WORK_DESCRIPTION_CODE];
}
