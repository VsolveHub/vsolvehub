import type { RequirementQuestionView } from "@/features/requirement/adapters";

import { DURATION_CODE, HEADCOUNT_CODE } from "./size";

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

const OCCASION_CODES: readonly string[] = [
  EVENT_TYPE_CODE,
  EVENT_DESCRIPTION_CODE,
  GUEST_BAND_CODE,
  SERVICE_STYLE_CODE,
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
  const roles = roleQuestions(questions);
  const roleCodes = new Set(
    roles.flatMap((role) => [
      role.code,
      roleGenderKey(role.code, "men"),
      roleGenderKey(role.code, "women"),
    ]),
  );
  return questions.filter(
    (question) =>
      !OCCASION_CODES.includes(question.code) &&
      !roleCodes.has(question.code) &&
      question.code !== HEADCOUNT_CODE &&
      question.code !== DURATION_CODE,
  );
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

/** A sane ceiling for one gender stepper so a stuck plus-button cannot run away. */
export const ROLE_COUNT_CAP = 50;

/** The catalogue's suffix for a role's total, which its two halves hang off. */
const ROLE_COUNT_SUFFIX = "_count";

export type CrewGender = "men" | "women";

/** `waiter_count` -> `waiter`. The stem the catalogue hangs a role's three questions off. */
function roleStem(roleCode: string): string {
  return roleCode.endsWith(ROLE_COUNT_SUFFIX)
    ? roleCode.slice(0, -ROLE_COUNT_SUFFIX.length)
    : roleCode;
}

/**
 * The catalogue's own code for one half of a role — `waiter_count` + `men` -> `waiter_men`.
 *
 * These used to be `waiter_count__men`: a key this client invented, which no
 * configuration published. Three things followed from that and all three were
 * invisible. `validate_scope` refuses an answer key the schema does not
 * define, so the first event-staff requirement to reach `submit_requirement`
 * would have been rejected naming a question the customer never saw.
 * `crew_brief` iterates the schema, so the professional was never told the
 * split. And matching sizes on `worker_count`, so nothing could act on it.
 *
 * Contract 1.53.0 publishes `<role>_men` and `<role>_women` as real questions.
 * This function is the one place that knows how to spell them.
 */
export function roleGenderKey(roleCode: string, gender: CrewGender): string {
  return `${roleStem(roleCode)}_${gender}`;
}

/**
 * Drops the pre-1.53.0 `<role>__men` keys from a restored draft.
 *
 * A draft saved by the old build is still in somebody's browser storage, and
 * those keys are now unknown to the schema — submitting one would earn a
 * refusal naming a question that no longer exists. The counts are re-derived
 * from the role totals by `syncHeadcount`, so dropping them loses nothing a
 * customer typed except the split, which they re-set on a screen they are
 * already looking at.
 */
export function withoutLegacyGenderKeys(
  answers: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(answers).filter(([key]) => !key.includes("__")),
  );
}

/**
 * How a suggested serving total is split across the two steppers.
 *
 * About two-thirds men: three serving staff open as 2 men and 1 woman, which is
 * the mix the brief shows. The customer can change either number afterwards.
 */
export function splitByGender(total: number): { men: number; women: number } {
  const n = Math.max(0, total);
  const men = Math.round(n * (2 / 3));
  return { men, women: n - men };
}

export function roleGenderCount(
  answers: Readonly<Record<string, unknown>>,
  roleCode: string,
  gender: CrewGender,
): number {
  return countOf(answers[roleGenderKey(roleCode, gender)]);
}

/**
 * People in one role: men + women when that split exists, otherwise the
 * catalogue's single count (restored drafts from before the split).
 */
export function rolePeopleCount(
  answers: Readonly<Record<string, unknown>>,
  roleCode: string,
): number {
  const men = answers[roleGenderKey(roleCode, "men")];
  const women = answers[roleGenderKey(roleCode, "women")];
  if (typeof men === "number" || typeof women === "number") {
    return countOf(men) + countOf(women);
  }
  return countOf(answers[roleCode]);
}

export function roleTotal(
  roles: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): number {
  return roles.reduce((total, role) => total + rolePeopleCount(answers, role.code), 0);
}

export function crewGenderTotals(
  roles: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): { men: number; women: number; people: number } {
  let men = 0;
  let women = 0;
  for (const role of roles) {
    men += roleGenderCount(answers, role.code, "men");
    women += roleGenderCount(answers, role.code, "women");
  }
  const people = roleTotal(roles, answers);
  if (men + women === 0 && people > 0) {
    return { men: people, women: 0, people };
  }
  return { men, women, people };
}

function writeRolePeople(
  answers: Readonly<Record<string, unknown>>,
  roles: readonly RequirementQuestionView[],
  code: string,
  men: number,
  women: number,
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...answers,
    [roleGenderKey(code, "men")]: men,
    [roleGenderKey(code, "women")]: women,
    [code]: men + women,
  };
  next[HEADCOUNT_CODE] = roleTotal(roles, next);
  return next;
}

/**
 * One role's new count, with the priced headcount kept in step.
 *
 * `worker_count` is what `rate_cards.preset_size`, matching and the shift-day
 * engine read, so it must always equal the roles the customer actually chose —
 * a stale headcount would price one crew and dispatch another.
 *
 * A single-number write puts everyone on the men stepper so older callers that
 * do not know the split still produce a consistent roster.
 */
export function withRoleCount(
  answers: Readonly<Record<string, unknown>>,
  roles: readonly RequirementQuestionView[],
  code: string,
  value: number,
): Record<string, unknown> {
  const n = Math.max(0, value);
  return writeRolePeople(answers, roles, code, n, 0);
}

export function withRoleGenderCount(
  answers: Readonly<Record<string, unknown>>,
  roles: readonly RequirementQuestionView[],
  code: string,
  gender: CrewGender,
  value: number,
): Record<string, unknown> {
  const capped = Math.min(ROLE_COUNT_CAP, Math.max(0, value));
  const other: CrewGender = gender === "men" ? "women" : "men";
  const otherCount = roleGenderCount(answers, code, other);
  return writeRolePeople(
    answers,
    roles,
    code,
    gender === "men" ? capped : otherCount,
    gender === "women" ? capped : otherCount,
  );
}

/** The headcount re-derived from the roles, for answers restored from storage. */
export function syncHeadcount(
  answers: Readonly<Record<string, unknown>>,
  roles: readonly RequirementQuestionView[],
): Record<string, unknown> {
  let next: Record<string, unknown> = withoutLegacyGenderKeys(answers);
  for (const role of roles) {
    const menKey = roleGenderKey(role.code, "men");
    const womenKey = roleGenderKey(role.code, "women");
    if (typeof next[menKey] === "number" || typeof next[womenKey] === "number") {
      next = writeRolePeople(
        next,
        roles,
        role.code,
        countOf(next[menKey]),
        countOf(next[womenKey]),
      );
    } else {
      next = writeRolePeople(next, roles, role.code, countOf(next[role.code]), 0);
    }
  }
  next[HEADCOUNT_CODE] = roleTotal(roles, next);
  return next;
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
  men: number;
  women: number;
}

export function genderMixPhrase(men: number, women: number): string {
  return `${men} ${men === 1 ? "man" : "men"} · ${women} ${women === 1 ? "woman" : "women"}`;
}

/** The chosen roles with a count, in the catalogue's order. */
export function crewMix(
  roles: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): readonly CrewMixLine[] {
  return roles
    .map((role) => {
      const men = roleGenderCount(answers, role.code, "men");
      const women = roleGenderCount(answers, role.code, "women");
      const count = rolePeopleCount(answers, role.code);
      return { code: role.code, label: role.label, count, men, women };
    })
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
  const current = rolePeopleCount(answers, SERVING_ROLE_CODE);
  const untouched = current === 0 || current === previousSuggestion;
  if (!untouched) return { ...answers };
  const { men, women } = splitByGender(suggestion);
  return writeRolePeople(answers, roles, SERVING_ROLE_CODE, men, women);
}
