// Ported from frontend/apps/customer/features/requirement/model/event-brief.ts
import type { RequirementQuestionView } from "../adapters";

/**
 * The event-shaped brief, detected from the catalogue rather than the slug.
 *
 * A variant that publishes an `event_type` question is asking about an occasion
 * with a fixed date — a wedding function, a birthday, a pooja. Two things about
 * the generic brief are wrong for that shape and are switched off by this
 * detection (2026-08-29 event-decor redesign):
 *
 * - **"Ready to start ± a week"** describes a renovation. An event happens on
 *   one date; step 2 relabels to "Event date" and hides the flexibility band
 *   and the "must finish by" row.
 * - **Setup access** is a step-2 fact — it belongs beside the date it
 *   qualifies, not in the middle of the occasion questions on step 1.
 *
 * Same detection idea as `crewFlowShape` in `features/crew`, which owns the A3
 * event-staff shape; this one owns the A5 project brief and deliberately knows
 * nothing about role counts.
 */

/** The question code that marks a brief as event-shaped. */
const EVENT_TYPE_CODE = "event_type";

/** The step-2 question: when decorators can get into the venue. */
const SETUP_ACCESS_CODE = "setup_access";

export interface EventBriefShape {
  /** True when the variant publishes an `event_type` question. */
  isEvent: boolean;
  /** The questions step 1 renders — without the one step 2 took. */
  whatQuestions: readonly RequirementQuestionView[];
  /** The setup-access question, when published and event-shaped. */
  setupAccessQuestion: RequirementQuestionView | null;
}

export function eventBriefShape(
  questions: readonly RequirementQuestionView[],
): EventBriefShape {
  const isEvent = questions.some((question) => question.code === EVENT_TYPE_CODE);
  if (!isEvent) return { isEvent: false, whatQuestions: questions, setupAccessQuestion: null };

  const setupAccessQuestion =
    questions.find((question) => question.code === SETUP_ACCESS_CODE) ?? null;
  return {
    isEvent: true,
    whatQuestions:
      setupAccessQuestion === null
        ? questions
        : questions.filter((question) => question.code !== SETUP_ACCESS_CODE),
    setupAccessQuestion,
  };
}

/**
 * Whether an optional TEXT question should be on screen at all.
 *
 * The capture rule is zero free text; the one escape hatch is the line behind a
 * "Something else" tile (the event-staff precedent). So an optional text input
 * hides until it is needed: a sibling choice answered `other`, or a value it
 * already carries (a restored draft must not hide what it restored). Required
 * text always renders — a required question with no control dead-ends the form.
 */
export function shouldShowTextQuestion(
  question: RequirementQuestionView,
  questions: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): boolean {
  if (question.kind !== "text") return true;
  if (question.required) return true;
  const current = answers[question.code];
  if (typeof current === "string" && current.trim().length > 0) return true;
  return questions.some(
    (sibling) =>
      (sibling.kind === "choice" || sibling.kind === "multi") &&
      (sibling.options ?? []).some((option) => option.value === "other") &&
      (Array.isArray(answers[sibling.code])
        ? (answers[sibling.code] as readonly unknown[]).includes("other")
        : answers[sibling.code] === "other"),
  );
}
