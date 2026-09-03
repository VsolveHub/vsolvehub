import type { RequirementQuestionView } from "@/features/requirement/adapters";

import {
  EVENT_TYPE_CODE,
  GUEST_BAND_CODE,
  isEventCrewFlow,
  occasionQuestions,
  roleQuestions,
  roleTotal,
} from "./event-flow";
import { HEADCOUNT_CODE } from "./size";

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

/**
 * Every stage the crew flow can be on, across its three shapes.
 *
 * - `plain` — a specific day-hire ("Electrician by the day"): details, rate.
 * - `work` — generic labour: choose the work, then details, then rate.
 * - `event` — event staff: the occasion, the crew, the details, then rate.
 */
export type CrewBookingStep = "occasion" | "work" | "crew" | "details" | "rate";

export type CrewFlowShape = "plain" | "work" | "event";

export function workTypeQuestion(
  questions: readonly RequirementQuestionView[],
): RequirementQuestionView | null {
  return questions.find((question) => question.code === WORK_TYPE_CODE) ?? null;
}

/**
 * Which shape the catalogue published. Read off the questions, never off a
 * service slug: a catalogue that publishes an occasion and roles for a
 * different service gets the event flow with it.
 */
export function crewFlowShape(questions: readonly RequirementQuestionView[]): CrewFlowShape {
  if (isEventCrewFlow(questions)) return "event";
  return workTypeQuestion(questions) === null ? "plain" : "work";
}

/**
 * A published team product: the Customer sizes it by guests, while one hidden
 * `worker_count` keeps the rate-card, matching and shift engines on their
 * existing contract. The shape is structural so another team-based service can
 * use it without adding a service-slug branch.
 */
export function isFixedTeamCrewFlow(
  questions: readonly RequirementQuestionView[],
): boolean {
  return (
    questions.some((question) => question.code === EVENT_TYPE_CODE) &&
    questions.some((question) => question.code === GUEST_BAND_CODE) &&
    questions.some((question) => question.code === HEADCOUNT_CODE) &&
    roleQuestions(questions).length === 0
  );
}

/** Highest guest count published by a fixed-team service, used by its quote hand-off copy. */
export function fixedTeamGuestLimit(
  questions: readonly RequirementQuestionView[],
): number | null {
  if (!isFixedTeamCrewFlow(questions)) return null;
  const guestQuestion = questions.find((question) => question.code === GUEST_BAND_CODE);
  const limits = (guestQuestion?.options ?? []).flatMap((option) =>
    [...`${option.value} ${option.label}`.matchAll(/\d+/g)].map((match) => Number(match[0])),
  );
  return limits.length === 0 ? null : Math.max(...limits);
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

/**
 * Where the flow opens.
 *
 * A specific day-hire publishes no `work_type` question — the customer answered
 * it by choosing the service — so its flow opens straight on planning. Generic
 * labour starts with the work picker, and event staff with the occasion.
 */
export function initialCrewBookingStep(
  questions: readonly RequirementQuestionView[],
): CrewBookingStep {
  switch (crewFlowShape(questions)) {
    case "event":
      return "occasion";
    case "work":
      return "work";
    default:
      return "details";
  }
}

function occasionComplete(
  questions: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): boolean {
  return occasionQuestions(questions).every((question) => {
    if (!question.required || question.kind !== "choice") return true;
    const value = answers[question.code];
    return (
      typeof value === "string" &&
      (question.options?.some((option) => option.value === value) ?? false)
    );
  });
}

/**
 * Where a restored draft resumes: at the first stage it has not finished.
 *
 * A recognised work choice resumes at planning; a stale one goes back to the
 * picker. An event draft resumes at the occasion until every choice on it is
 * one the catalogue still publishes, at the crew until somebody is on it, and
 * at the details after that.
 */
export function resumeCrewBookingStep(
  questions: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): CrewBookingStep {
  switch (crewFlowShape(questions)) {
    case "event":
      if (!occasionComplete(questions, answers)) return "occasion";
      return roleTotal(roleQuestions(questions), answers) > 0 ? "details" : "crew";
    case "work":
      return selectedWorkLabel(workTypeQuestion(questions), answers) === null ? "work" : "details";
    default:
      return "details";
  }
}

/** The free-text follow-up is visible only for the server's `other` option. */
export function hiddenCrewQuestionCodes(
  answers: Readonly<Record<string, unknown>>,
  questions: readonly RequirementQuestionView[] = [],
): readonly string[] {
  const hidden = answers[WORK_TYPE_CODE] === OTHER_WORK_TYPE ? [] : [WORK_DESCRIPTION_CODE];
  return isFixedTeamCrewFlow(questions) ? [...hidden, HEADCOUNT_CODE] : hidden;
}
