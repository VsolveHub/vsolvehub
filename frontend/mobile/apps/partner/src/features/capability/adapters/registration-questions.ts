// Ported from frontend/apps/partner/features/capability/adapters/registration-questions.ts
/**
 * The category-specific questions a capability asks at registration.
 *
 * Closes the "category-specific steps" half of `M2-FE-105`, and it is the reason
 * that half needed no client-side branch: contract 1.23.0 publishes
 * `CapabilityOption.registration_questions`, authored by Operations on the same
 * versioned schema M1 already validates cart scope against. A construction
 * variant asking for a safety certificate and an events variant asking for a
 * venue insurance number are one form here and two rows in a database there.
 *
 * ## Why this parses rather than casts
 *
 * The field is published as `unknown[]`. It is Operations-authored JSON with no
 * generated type behind it, and the backend's own reader
 * (`capability_options._registration_questions`) is deliberately defensive for
 * the same reason: this list is the first screen a new vendor sees, and one
 * malformed row must not blank the catalog for them. So every row is narrowed,
 * a row this build cannot render is *reported* rather than dropped, and the form
 * never invents a control for a shape it does not understand.
 *
 * ## The vocabulary is `validate_scope`'s, not the catalog's
 *
 * `apps.carts.item_inputs.validate_scope` is what the answers are checked
 * against, and it accepts `INTEGER`, `TEXT`, `BOOLEAN` and `SELECT`. That is a
 * different vocabulary from the customer-facing `ServiceQuestionKindEnum`
 * (`SINGLE_CHOICE`/`NUMBER`/…), and the two are not interchangeable — sending an
 * answer keyed to the wrong one is refused with `m2_business_type_invalid`.
 *
 * **`SELECT` carries no options.** The stored schema has `code`, `kind`,
 * `required` and `minimum` and nothing else, so a select has no list to choose
 * from and no prompt to show. It is reported as unsupported rather than rendered
 * as a free-text box that would fail validation on submit. Logged in
 * `frontend-execution-plan.md` §7.
 */

export const QUESTION_KINDS = ["INTEGER", "TEXT", "BOOLEAN"] as const;

/** Kinds this build has a control for. `SELECT` is validated and unrenderable. */
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export interface RegistrationQuestion {
  readonly code: string;
  /** Derived from the code — the schema carries no prompt. See the header. */
  readonly label: string;
  readonly kind: QuestionKind;
  readonly isRequired: boolean;
  /** `INTEGER` only. `null` when the schema set none. */
  readonly minimum: number | null;
}

export interface RegistrationQuestionSet {
  readonly questions: readonly RegistrationQuestion[];
  /**
   * Codes the server asks for and this build cannot render.
   *
   * Named rather than counted, so the screen can say which. A silently dropped
   * required question produces a submit that is refused for a reason nothing on
   * screen explains.
   */
  readonly unsupported: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A human label from a question code.
 *
 * The same de-slugging the enquiry screen applies to answer codes, and the same
 * caveat: this is presentation of a server value, not a substitute for a prompt
 * the schema does not carry. `site_safety_certificate` reads as "Site safety
 * certificate", which is the best a client can honestly do.
 */
export function labelForCode(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function readRegistrationQuestions(rows: readonly unknown[]): RegistrationQuestionSet {
  const questions: RegistrationQuestion[] = [];
  const unsupported: string[] = [];

  for (const row of rows) {
    if (!isRecord(row)) continue;
    const code = row.code;
    if (typeof code !== "string" || code.trim() === "") continue;

    const kind = row.kind;
    if (typeof kind !== "string" || !QUESTION_KINDS.includes(kind as QuestionKind)) {
      unsupported.push(code);
      continue;
    }

    questions.push({
      code,
      label: labelForCode(code),
      kind: kind as QuestionKind,
      isRequired: row.required === true,
      minimum: typeof row.minimum === "number" ? row.minimum : null,
    });
  }

  return { questions, unsupported };
}

/**
 * Turns the form's own strings into the answer object the wire takes.
 *
 * Typed per kind, because `validate_scope` refuses a string where it wants an
 * integer and a string where it wants a boolean. An empty optional answer is
 * omitted rather than sent as `""` — the validator treats a present key as an
 * answer, and an empty string is an answer nobody gave.
 */
export function toRegistrationAnswers(
  questions: readonly RegistrationQuestion[],
  values: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const answers: Record<string, unknown> = {};

  for (const question of questions) {
    const raw = values[question.code];
    if (raw === undefined || raw.trim() === "") continue;

    if (question.kind === "INTEGER") {
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isNaN(parsed)) answers[question.code] = parsed;
      continue;
    }
    if (question.kind === "BOOLEAN") {
      answers[question.code] = raw === "true";
      continue;
    }
    answers[question.code] = raw;
  }

  return answers;
}

/** Required questions the Partner has not answered. Guidance — the server decides. */
export function unansweredRequired(
  questions: readonly RegistrationQuestion[],
  values: Readonly<Record<string, string>>,
): RegistrationQuestion[] {
  return questions.filter((question) => {
    if (!question.isRequired) return false;
    // A boolean is answered by either value, including "false". Only an absent
    // control counts as unanswered.
    const raw = values[question.code];
    return raw === undefined || raw.trim() === "";
  });
}
