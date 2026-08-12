import { formatMoney } from "@vsolve/ui";

/**
 * Reading the frozen requirement a vendor was invited against.
 *
 * `EnquiryDetail.answers` is `unknown` on the wire — a `JSONField` copied out of
 * `RequirementSnapshot`, keyed by whatever question codes the service variant's
 * `question_schema` defines. The schema itself is **not published to the
 * Partner**, so the client receives values with no labels, no types and no
 * ordering.
 *
 * That gap is logged in `frontend-execution-plan.md` §7. Until it closes this
 * module does the only honest thing available: it prints exactly what the server
 * sent, with the code de-slugged into a readable label and nothing invented
 * around it. No default answers, no "not specified" for a key that was never
 * sent, no guessed units.
 *
 * ## Two codes are read by name, and only two
 *
 * `worker_count` and `duration_days` are read individually because the Django
 * domain reads them by name too — `matching._requested_days` and
 * `evaluate_candidates` both do — so they are part of the M2 domain vocabulary
 * rather than one variant's questionnaire. Everything else is passed through
 * unnamed, because naming it here would be this client deciding what a
 * catalogue question means.
 */

export type AnswerMap = Readonly<Record<string, unknown>>;

/** Narrows the wire's `unknown` to something indexable, or to nothing. */
export function readAnswers(value: unknown): AnswerMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as AnswerMap;
}

function readPositiveInteger(answers: AnswerMap, code: string): number | null {
  const raw = answers[code];
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * How many people the customer asked for, when they said.
 *
 * Used to prefill the A3 composer's headcount so the vendor confirms a number
 * rather than re-entering one — which is what keeps that composer to one screen.
 * `null` means the customer did not say, and the field is then a real question.
 */
export function readHeadcount(answers: AnswerMap): number | null {
  return readPositiveInteger(answers, "worker_count");
}

/** How many days the work runs, when the customer said. */
export function readDurationDays(answers: AnswerMap): number | null {
  return readPositiveInteger(answers, "duration_days");
}

/** `site_access` -> `Site access`. Presentation of a server value, not a rename. */
export function labelForCode(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A JSON value as one line of text, or `null` when it cannot be shown honestly.
 *
 * Nested objects return `null` rather than `[object Object]` or a JSON dump. A
 * structure this build does not understand is a structure it should not
 * paraphrase to a vendor who is about to price against it — the detail screen
 * says so explicitly instead.
 */
export function formatAnswerValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    const parts = value.map(formatAnswerValue).filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  return null;
}

export interface RequirementFact {
  readonly code: string;
  readonly label: string;
  readonly value: string;
}

/**
 * The customer's answers as label/value pairs, in the order the server sent
 * them.
 *
 * Server order rather than an alphabetical or curated one: the question schema
 * decides what a vendor reads first, and re-sorting here would put this client
 * in charge of an ordering the catalogue owns.
 */
export function requirementFacts(answers: AnswerMap): RequirementFact[] {
  const facts: RequirementFact[] = [];
  for (const [code, raw] of Object.entries(answers)) {
    const value = formatAnswerValue(raw);
    if (value === null) continue;
    facts.push({ code, label: labelForCode(code), value });
  }
  return facts;
}

/** Answer keys whose value this build could not render as a line of text. */
export function unreadableAnswerCount(answers: AnswerMap): number {
  return Object.values(answers).filter((raw) => formatAnswerValue(raw) === null).length;
}

/**
 * The customer's stated budget, or nothing.
 *
 * A one-sided band is published and meaningful — a ceiling with no floor is the
 * common case — so all three shapes are handled rather than requiring both.
 * `classify_usability` compares a quote against the ceiling alone, and a vendor
 * who cannot see it is quoting blind into an `OUT_OF_BUDGET` label.
 */
export function budgetLine(minPaise: number | null, maxPaise: number | null): string | null {
  if (minPaise !== null && maxPaise !== null) {
    return `${formatMoney(minPaise)} – ${formatMoney(maxPaise)}`;
  }
  if (maxPaise !== null) return `Up to ${formatMoney(maxPaise)}`;
  if (minPaise !== null) return `From ${formatMoney(minPaise)}`;
  return null;
}
