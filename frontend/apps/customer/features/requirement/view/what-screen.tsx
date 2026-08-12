"use client";

import { Field, Input, Select, Textarea } from "@vsolve/ui";

import type { RequirementQuestionView } from "../adapters";
import { useRequirement } from "./requirement-context";

/**
 * Screen 1 — What you need.
 *
 * ## The Customer never chooses an archetype
 *
 * `GAP-006` is the rule this screen exists to honour. A3 and A5 are our words for
 * two ways of buying, and asking someone to pick between "time block" and
 * "custom project" makes them learn our model before they can describe their
 * problem. They answer ordinary questions — how many people, for how long, what
 * outcome — and the server infers the lifecycle from the answers.
 *
 * What they *do* see is the server's plain-language reading of it, once there is
 * one: "You are hiring people for a period of time." That sentence is authored by
 * the server that made the inference, never assembled here, so the two cannot
 * drift apart.
 *
 * ## Questions come from the server
 *
 * `questions` is catalogue configuration. A hardcoded list here would be a second
 * source of truth about what a valid requirement is, disagreeing silently with
 * the one the server validates against — and the disagreement would surface as a
 * Customer being refused for a field they were never shown.
 */

export interface WhatScreenProps {
  categoryName: string;
  questions: readonly RequirementQuestionView[];
  /**
   * Question codes the catalogue configured that this build cannot render.
   *
   * Passed in rather than hidden by the adapter, because a required question
   * with no control leaves "Next" disabled and nothing on screen explaining it.
   * See `toQuestionSet` for what lands here and why.
   */
  unsupportedQuestions?: readonly string[];
}

export function WhatScreen({
  categoryName,
  questions,
  unsupportedQuestions = [],
}: WhatScreenProps) {
  const { state, dispatch } = useRequirement();

  return (
    <div>
      <h2 className="text-lg font-semibold text-text">What do you need for {categoryName}?</h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Tell us what the job involves. We will work out what kind of help that
        needs — you do not have to know.
      </p>

      {unsupportedQuestions.length > 0 ? (
        <div
          role="alert"
          className="mt-4 rounded-card border border-warning-line bg-warning-surface p-4"
        >
          <p className="font-semibold text-text">
            This service is not fully set up for requests yet
          </p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            Part of the form is missing on our side, so a request sent from here
            may be refused. Nothing you enter is charged for, and support can take
            the details over the phone instead.
          </p>
        </div>
      ) : null}

      {state.verdict !== null ? (
        <p
          // Polite rather than assertive: it updates as answers change, and an
          // assertive region would interrupt the Customer mid-question to read
          // out a sentence about what they just typed.
          aria-live="polite"
          className="mt-4 rounded-card border border-info-line bg-info-surface p-4 text-sm text-text"
        >
          {state.verdict.explanation}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-5">
        {questions.map((question) => {
          const value = state.answers[question.code];

          return (
            <Field
              key={question.code}
              label={question.label}
              description={question.help}
              required={question.required}
            >
              {question.kind === "choice" ? (
                <Select
                  // The shared control renders this as a disabled first option
                  // so a select can never silently default to a real value the
                  // Customer did not choose.
                  placeholder="Choose one"
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) =>
                    dispatch({
                      type: "ANSWER",
                      questionCode: question.code,
                      value: event.target.value,
                    })
                  }
                >
                  {(question.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              ) : question.kind === "boolean" ? (
                // Two radios rather than a checkbox. A checkbox has no
                // "unanswered" state — it renders "no" and "not asked yet"
                // identically — and the guard the server sends back
                // (`missing_required_answers`) distinguishes them, so a
                // Customer would be blocked by a question that looks answered.
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
                        checked={value === option.value}
                        onChange={() =>
                          dispatch({
                            type: "ANSWER",
                            questionCode: question.code,
                            value: option.value,
                          })
                        }
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
                  value={typeof value === "number" ? String(value) : ""}
                  onChange={(event) =>
                    dispatch({
                      type: "ANSWER",
                      questionCode: question.code,
                      // Empty clears the answer rather than becoming 0 — "none"
                      // and "not answered yet" are different, and only one of
                      // them should satisfy a required question.
                      value: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              ) : (
                <Textarea
                  rows={3}
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) =>
                    dispatch({
                      type: "ANSWER",
                      questionCode: question.code,
                      value: event.target.value,
                    })
                  }
                />
              )}
            </Field>
          );
        })}
      </div>
    </div>
  );
}
