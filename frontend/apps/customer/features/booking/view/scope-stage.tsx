"use client";

import type { Schemas } from "@vsolve/api-client";
import { Field, Input, Select, Textarea } from "@vsolve/ui";

import { isAnswered } from "../model/state";
import { TaskPicker, type TaskOption } from "./task-picker";
import { useWorkspace } from "./workspace-context";

/**
 * Scope questions, rendered from the published variant configuration.
 *
 * Every question, its kind, its options and whether it is required come from
 * `ServiceVariantConfiguration` — nothing about any particular service is
 * hardcoded here. Adding a question to a service is an Operations change, not a
 * frontend release.
 *
 * Doc 03 §3 also asks for progressive disclosure of dependent questions. The
 * published contract carries no dependency expression on `ServiceQuestion`
 * (only `validation_rules`, which is untyped), so this renders the flat list and
 * the dependency graph waits for a contract that can express it. Faking it from
 * a naming convention would be inventing a rule Operations never wrote.
 */

type Question = Schemas["ServiceQuestion"];

interface QuestionControlProps {
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
  showError: boolean;
}

function QuestionControl({ question, value, onChange, showError }: QuestionControlProps) {
  const error =
    showError && question.is_required && !isAnswered(value)
      ? "Please answer this to continue."
      : undefined;

  const common = {
    label: question.prompt,
    description: question.help_text || undefined,
    required: question.is_required,
    error,
  };

  switch (question.kind) {
    case "BOOLEAN":
      return (
        <Field {...common}>
          <Select
            placeholder="Choose one"
            value={value === undefined ? "" : String(value)}
            onChange={(event) => onChange(event.target.value === "true")}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </Field>
      );

    case "SINGLE_CHOICE":
      return (
        <Field {...common}>
          <Select
            placeholder="Choose one"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          >
            {question.options.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      );

    case "MULTIPLE_CHOICE": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset className="border-0 p-0">
          <legend className="text-sm font-semibold text-text">
            {question.prompt}
            {question.is_required ? (
              <>
                <span aria-hidden className="ml-0.5 text-danger-text">
                  *
                </span>
                <span className="sr-only"> (required)</span>
              </>
            ) : (
              <span className="ml-1.5 font-normal text-text-muted">(optional)</span>
            )}
          </legend>
          {question.help_text ? (
            <p className="mt-1 text-sm text-text-secondary">{question.help_text}</p>
          ) : null}

          <div className="mt-2 flex flex-col gap-2">
            {question.options.map((option) => (
              <label
                key={option.code}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line-strong px-3 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-action"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.code)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, option.code]
                        : selected.filter((code) => code !== option.code),
                    )
                  }
                  className="h-5 w-5 accent-[color:var(--color-signal-600)]"
                />
                <span className="min-w-0">
                  <span className="block text-text">{option.label}</span>
                  {option.description ? (
                    <span className="block text-sm text-text-secondary">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>

          {error ? (
            <p role="alert" className="mt-1.5 text-sm font-medium text-danger-text">
              {error}
            </p>
          ) : null}
        </fieldset>
      );
    }

    case "NUMBER":
      return (
        <Field {...common}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={typeof value === "number" ? value : ""}
            onChange={(event) =>
              onChange(event.target.value === "" ? undefined : Number(event.target.value))
            }
          />
        </Field>
      );

    case "TEXT":
    default:
      return (
        <Field {...common}>
          <Textarea
            rows={3}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );
  }
}

export interface ScopeStageProps {
  questions: readonly Question[];
  tasks: readonly TaskOption[];
  minimumSubtotalPaise: number | null;
  /** Set once the customer has tried to continue, so errors are not premature. */
  showErrors?: boolean;
}

export function ScopeStage({
  questions,
  tasks,
  minimumSubtotalPaise,
  showErrors = false,
}: ScopeStageProps) {
  const { state, dispatch } = useWorkspace();

  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Tell us about the work</h2>
      <p className="mt-1 text-sm text-text-secondary">
        This helps us send the right professional with the right parts.
      </p>

      <div className="mt-4 flex flex-col gap-5">
        <TaskPicker tasks={tasks} minimumSubtotalPaise={minimumSubtotalPaise} />

        {questions.map((question) => (
          <QuestionControl
            key={question.code}
            question={question}
            value={state.answers[question.code]}
            onChange={(value) =>
              dispatch({ type: "ANSWER", questionCode: question.code, value })
            }
            showError={showErrors}
          />
        ))}

        <Field
          label="Anything else we should know?"
          description="Landmarks, access instructions, or what you have already tried."
        >
          <Textarea
            rows={3}
            value={state.notes}
            onChange={(event) => dispatch({ type: "SET_NOTES", notes: event.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}
