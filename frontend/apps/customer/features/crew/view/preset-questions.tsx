"use client";

import { ChoiceChips, Field, QuantityStepper, Textarea, cn } from "@vsolve/ui";

import type { RequirementQuestionView } from "@/features/requirement/adapters";

/**
 * The preset's questions — `M2-FE-425`.
 *
 * ## The client does not own this list
 *
 * Which questions exist, which are required and what they offer is catalogue
 * configuration published on the variant. A hardcoded list here — "floor
 * number, lift, carry distance, packing" typed into a component — would be a
 * second source of truth about what a valid preset is, disagreeing silently with
 * the one the server validates against, and the disagreement would surface as a
 * Customer refused for a field they were never shown. So this renders whatever
 * the server publishes, in the server's own order and words.
 *
 * ## Why the controls are duplicated from `WhatScreen` rather than shared
 *
 * `WhatScreen` reads and writes the four-screen flow's reducer through
 * `useRequirement()`. This screen is deliberately **not** that flow — ADR-0009
 * says the four screens remain the A5 shape — so the shared thing would have to
 * be a context-free control set, which is a refactor of a shipped flow rather
 * than a wave of new build. The rules the two share are the ones that matter and
 * they are repeated here on purpose: a boolean is two radios rather than a
 * checkbox, because a checkbox renders "no" and "not asked yet" identically.
 *
 * ## Which control a question gets is read off the data, never off its code
 *
 * A number is a stepper, a short undescribed choice list is a row of chips, and
 * a described one keeps its stacked cards. Those rules look at the question's
 * kind, its option count and its label lengths — not at a map of question codes
 * typed in here, which would be this component knowing one catalogue's
 * vocabulary and silently falling back to a text box the day Operations renames
 * something.
 *
 * The described-choice case is the one worth defending, because chips would be
 * more compact and the mock draws them. A3's work type and A5's fit-out picker
 * both publish a sentence per option, and that sentence is the difference
 * between a Customer choosing the work and guessing which label is closest.
 * A chip has nowhere to put it. Losing the server's own words to save vertical
 * space is not a trade this form makes.
 */

export interface PresetQuestionsProps {
  questions: readonly RequirementQuestionView[];
  answers: Readonly<Record<string, unknown>>;
  onAnswer: (questionCode: string, value: unknown) => void;
  disabled?: boolean;
  /**
   * Question codes to leave unrendered for now.
   *
   * The caller decides, never this component. A follow-up question that only
   * makes sense after a particular answer — A3's "tell us what the work is",
   * which exists for the "Something else" branch of `work_type` — is a fact
   * about that variant's vocabulary, and a rule encoded here would be this
   * component knowing one catalogue's option codes.
   *
   * Hidden, not disabled: a control nobody can reach should not occupy a line
   * on the form. Anything hidden must be optional, or the Customer would be
   * blocked by a question they cannot see.
   */
  hiddenCodes?: readonly string[];
}

/**
 * The floor a stepper falls back to when the catalogue publishes no rule.
 *
 * One, not zero. Every number this preset asks for is a count of something the
 * booking needs at least one of, and `quote_at_published_rate` refuses a zero
 * outright — so a stepper that could reach it would offer a state whose only
 * outcome is a refusal after the rest of the form is filled in.
 */
const DEFAULT_NUMBER_FLOOR = 1;

/**
 * Whether a choice question's options are short enough to sit on chips.
 *
 * Chips put every option on screen at once, which is the whole reason to use
 * them — but a chip is one line, and an option carrying a sentence of
 * description has nowhere to put it. So the long-form list keeps the stacked
 * cards it already had, and the decision is made from the *data* rather than
 * from a list of question codes typed in here. The catalogue owns its
 * vocabulary; this only reads how big it is.
 */
function fitsOnChips(question: RequirementQuestionView): boolean {
  const options = question.options ?? [];
  if (options.length === 0 || options.length > 6) return false;
  return options.every(
    (option) => option.description === undefined && option.label.length <= 28,
  );
}

export function PresetQuestions({
  questions,
  answers,
  onAnswer,
  disabled = false,
  hiddenCodes = [],
}: PresetQuestionsProps) {
  return (
    <div className="flex flex-col gap-5">
      {questions.map((question) => {
        if (hiddenCodes.includes(question.code)) return null;
        const value = answers[question.code];

        // A stepper carries its own label and hint, so it is not wrapped in a
        // `Field` — that would render the question twice, once as the field's
        // label and once as the group's.
        if (question.kind === "number") {
          const floor = question.minimum ?? DEFAULT_NUMBER_FLOOR;
          const current = typeof value === "number" ? value : floor;
          const noun = question.label.toLowerCase();
          return (
            <QuantityStepper
              key={question.code}
              label={question.label}
              value={current}
              min={floor}
              onChange={(next) => onAnswer(question.code, next)}
              disabled={disabled}
              hint={question.help}
              unit={noun}
              // Phrased against what is being counted, because a screen with two
              // steppers on it has two "Increase" buttons otherwise.
              decrementLabel={`Fewer ${noun}`}
              incrementLabel={`More ${noun}`}
            />
          );
        }

        return (
          <Field
            key={question.code}
            label={question.label}
            description={question.help}
            required={question.required}
          >
            {question.kind === "choice" && fitsOnChips(question) ? (
              // Short, undescribed options go on chips: every answer visible at
              // once, on one or two lines, instead of a column of cards that
              // pushes the price rail's first row below the fold.
              <ChoiceChips
                label={question.label}
                name={question.code}
                options={(question.options ?? []).map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={typeof value === "string" ? value : null}
                onChange={(next) => onAnswer(question.code, next)}
                disabled={disabled}
              />
            ) : question.kind === "choice" ? (
              // Cards rather than a `<select>`. The server publishes a
              // description for every option and a dropdown throws all of them
              // away — which is the difference between a Customer choosing the
              // work and a Customer guessing which label is closest. It is also
              // what A5's fit-out picker already does with the same shape of
              // data, so the two capture flows now read alike.
              //
              // Radios, so one answer is enforced by the platform and arrow keys
              // work; the visual card is a label wrapped around each one.
              <div className="flex flex-col gap-2" role="radiogroup" aria-label={question.label}>
                {(question.options ?? []).map((option) => {
                  const isSelected = value === option.value;
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors duration-fast",
                        "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-action",
                        isSelected
                          ? "border-selected-line bg-selected-surface"
                          : "border-line bg-surface hover:border-line-strong",
                        disabled ? "cursor-not-allowed opacity-60" : "",
                      )}
                    >
                      <input
                        type="radio"
                        name={question.code}
                        disabled={disabled}
                        checked={isSelected}
                        onChange={() => onAnswer(question.code, option.value)}
                        className="mt-0.5 size-5 shrink-0 border-line text-action focus-visible:outline-none"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-text">{option.label}</span>
                        {option.description ? (
                          <span className="text-sm leading-6 text-text-secondary">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : question.kind === "boolean" ? (
              // Two radios rather than a checkbox: an unanswered boolean and a
              // "no" must not render identically, because only one of them
              // satisfies a required question.
              <div className="flex flex-col gap-2">
                {[
                  { value: true, label: "Yes" },
                  { value: false, label: "No" },
                ].map((option) => (
                  <label
                    key={option.label}
                    className="flex items-center gap-3 text-sm leading-6 text-text"
                  >
                    <input
                      type="radio"
                      name={question.code}
                      disabled={disabled}
                      checked={value === option.value}
                      onChange={() => onAnswer(question.code, option.value)}
                      className="size-5 border-line text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            ) : (
              <Textarea
                rows={3}
                disabled={disabled}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onAnswer(question.code, event.target.value)}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

/**
 * Whether every required question has an answer.
 *
 * A client-side completeness check and nothing more. `submit_requirement`
 * re-validates against `M2VariantConfiguration.question_schema` — a *different*
 * schema from the catalogue questions rendered above, authored separately by
 * Operations — so this decides only whether to enable a button, never whether a
 * command will succeed. The mismatch between the two schemas is logged in
 * `frontend-execution-plan.md` §7 and is the server's to answer.
 */
export function requiredAnswersPresent(
  questions: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): boolean {
  return questions.every((question) => {
    if (!question.required) return true;
    const value = answers[question.code];
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim() !== "";
    return true;
  });
}
