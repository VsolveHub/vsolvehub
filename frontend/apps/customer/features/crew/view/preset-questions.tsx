"use client";

import { Field, Input, Select, Textarea } from "@vsolve/ui";

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
 * checkbox because a checkbox renders "no" and "not asked yet" identically, and
 * an empty number clears the answer rather than becoming zero.
 */

export interface PresetQuestionsProps {
  questions: readonly RequirementQuestionView[];
  answers: Readonly<Record<string, unknown>>;
  onAnswer: (questionCode: string, value: unknown) => void;
  disabled?: boolean;
}

export function PresetQuestions({
  questions,
  answers,
  onAnswer,
  disabled = false,
}: PresetQuestionsProps) {
  return (
    <div className="flex flex-col gap-5">
      {questions.map((question) => {
        const value = answers[question.code];

        return (
          <Field
            key={question.code}
            label={question.label}
            description={question.help}
            required={question.required}
          >
            {question.kind === "choice" ? (
              <Select
                placeholder="Choose one"
                disabled={disabled}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onAnswer(question.code, event.target.value)}
              >
                {(question.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
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
            ) : question.kind === "number" ? (
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                disabled={disabled}
                value={typeof value === "number" ? String(value) : ""}
                onChange={(event) =>
                  onAnswer(
                    question.code,
                    // Empty clears the answer rather than becoming 0. "None" and
                    // "not answered yet" are different, and a headcount of zero
                    // is what the rate preview refuses to price.
                    event.target.value === "" ? null : Number(event.target.value),
                  )
                }
              />
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
