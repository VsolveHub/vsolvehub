import type { RequirementQuestionView } from "@/features/requirement/adapters";

import { HEADCOUNT_CODE } from "./size";

/**
 * The event-staff shape of the crew flow, and the handful of codes it turns on.
 *
 * ## Why this file names codes at all
 *
 * `PresetQuestions` deliberately knows no question codes and renders whatever
 * the catalogue publishes. That is right for a form, and wrong for a *flow*: an
 * occasion screen has to know which questions are about the occasion, a crew
 * composer has to know which numbers are roles, and a headcount the server
 * prices from has to stay equal to the sum of those roles. Those are structural
 * relationships between answers, not presentation, and they live here on the
 * same footing as `size.ts` — the one other place this app names a code.
 *
 * The catalogue still owns every label, description and option. Nothing here
 * decides what a role is called or what the occasions are; it only says which
 * published questions belong to which screen.
 */

export const EVENT_TYPE_CODE = "event_type";
export const EVENT_DESCRIPTION_CODE = "event_description";
export const OTHER_EVENT_TYPE = "other";
export const GUEST_BAND_CODE = "guest_band";
export const SERVICE_STYLE_CODE = "service_style";
export const DRESS_CODE_CODE = "dress_code";
export const STAFF_MEAL_CODE = "staff_meal_provided";
export const STAFF_PREFERENCE_CODE = "staff_preference";

const OCCASION_CODES: readonly string[] = [
  EVENT_TYPE_CODE,
  EVENT_DESCRIPTION_CODE,
  GUEST_BAND_CODE,
  SERVICE_STYLE_CODE,
];

const PRESENTATION_CODES: readonly string[] = [
  DRESS_CODE_CODE,
  STAFF_MEAL_CODE,
  STAFF_PREFERENCE_CODE,
];

/** A counted role: a number question other than the headcount, named `*_count`. */
export function isRoleQuestion(question: RequirementQuestionView): boolean {
  return (
    question.kind === "number" &&
    question.code !== HEADCOUNT_CODE &&
    question.code.endsWith("_count")
  );
}

export function roleQuestions(
  questions: readonly RequirementQuestionView[],
): readonly RequirementQuestionView[] {
  return questions.filter(isRoleQuestion);
}

export function occasionQuestions(
  questions: readonly RequirementQuestionView[],
): readonly RequirementQuestionView[] {
  return questions.filter((question) => OCCASION_CODES.includes(question.code));
}

export function presentationQuestions(
  questions: readonly RequirementQuestionView[],
): readonly RequirementQuestionView[] {
  return questions.filter((question) => PRESENTATION_CODES.includes(question.code));
}

/**
 * Whether the catalogue published the event shape: an occasion to choose and
 * at least one role to count. Either alone is an ordinary crew form.
 */
export function isEventCrewFlow(questions: readonly RequirementQuestionView[]): boolean {
  return (
    questions.some((question) => question.code === EVENT_TYPE_CODE) &&
    roleQuestions(questions).length > 0
  );
}

function countOf(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

export function roleTotal(
  roles: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): number {
  return roles.reduce((total, role) => total + countOf(answers[role.code]), 0);
}

/**
 * One role's new count, with the priced headcount kept in step.
 *
 * `worker_count` is what `rate_cards.preset_size`, matching and the shift-day
 * engine read, so it must always equal the roles the customer actually chose —
 * a stale headcount would price one crew and dispatch another.
 */
export function withRoleCount(
  answers: Readonly<Record<string, unknown>>,
  roles: readonly RequirementQuestionView[],
  code: string,
  value: number,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...answers, [code]: Math.max(0, value) };
  next[HEADCOUNT_CODE] = roleTotal(roles, next);
  return next;
}

/** The headcount re-derived from the roles, for answers restored from storage. */
export function syncHeadcount(
  answers: Readonly<Record<string, unknown>>,
  roles: readonly RequirementQuestionView[],
): Record<string, unknown> {
  return { ...answers, [HEADCOUNT_CODE]: roleTotal(roles, answers) };
}

/** The free-text follow-up is visible only behind the catalogue's `other` occasion. */
export function hiddenEventQuestionCodes(
  answers: Readonly<Record<string, unknown>>,
): readonly string[] {
  return answers[EVENT_TYPE_CODE] === OTHER_EVENT_TYPE ? [] : [EVENT_DESCRIPTION_CODE];
}

export interface CrewMixLine {
  code: string;
  label: string;
  count: number;
}

/** The chosen roles with a count, in the catalogue's order. */
export function crewMix(
  roles: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): readonly CrewMixLine[] {
  return roles
    .map((role) => ({ code: role.code, label: role.label, count: countOf(answers[role.code]) }))
    .filter((line) => line.count > 0);
}

/** "6 waiters and serving staff · 2 bar and beverage staff", or null with nobody chosen. */
export function crewMixLabel(
  roles: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): string | null {
  const lines = crewMix(roles, answers);
  if (lines.length === 0) return null;
  return lines.map((line) => `${line.count} ${line.label.toLowerCase()}`).join(" · ");
}

/**
 * The guest bands and service styles the suggestion knows, by option code.
 *
 * A rule of thumb, not a price: roughly one server per 30 guests at a buffet,
 * one per 15 at a sit-down where every course is carried, one per 25 when trays
 * circulate. It only ever fills a sentence — the customer sets the counts, and
 * nothing here reaches the server.
 */
const GUESTS_BY_BAND: Readonly<Record<string, number>> = {
  "under-50": 40,
  "50-100": 75,
  "100-200": 150,
  "200-plus": 250,
};

const GUESTS_PER_SERVER: Readonly<Record<string, number>> = {
  buffet: 30,
  "sit-down": 15,
  passed: 25,
};

export function suggestedServers(guestBand: unknown, serviceStyle: unknown): number | null {
  if (typeof guestBand !== "string" || typeof serviceStyle !== "string") return null;
  const guests = GUESTS_BY_BAND[guestBand];
  const perServer = GUESTS_PER_SERVER[serviceStyle];
  if (guests === undefined || perServer === undefined) return null;
  return Math.max(1, Math.round(guests / perServer));
}

/** The role the suggestion fills: the serving staff. */
export const SERVING_ROLE_CODE = "waiter_count";

/**
 * The serving-staff count set from the crowd and the service style.
 *
 * Applied when the occasion changes, so a customer who says "150 guests,
 * buffet" sees five serving staff already on the crew rather than a sentence
 * telling them to add five. A count the customer has changed by hand is left
 * alone: the fill only replaces a value that is still the *previous*
 * suggestion (or nothing), which is what makes it a suggestion rather than a
 * form that argues back. The headcount follows, as it always does.
 */
export function applyServingSuggestion(
  answers: Readonly<Record<string, unknown>>,
  roles: readonly RequirementQuestionView[],
  suggestion: number | null,
  previousSuggestion: number | null,
): Record<string, unknown> {
  if (suggestion === null) return { ...answers };
  if (!roles.some((role) => role.code === SERVING_ROLE_CODE)) return { ...answers };
  const current = countOf(answers[SERVING_ROLE_CODE]);
  const untouched = current === 0 || current === previousSuggestion;
  if (!untouched) return { ...answers };
  return withRoleCount(answers, roles, SERVING_ROLE_CODE, suggestion);
}
