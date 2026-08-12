"use client";

import { Badge, Button, Card, EmptyState, Field, Input, Select, cn } from "@vsolve/ui";
import { useState } from "react";

import { AsyncSection, type AsyncState } from "@/components/async-section";

import type { CapabilityChoice, CapabilityOptionsView } from "../adapters/capability-options";
import {
  unansweredRequired,
  type RegistrationQuestion,
} from "../adapters/registration-questions";

/**
 * Asking to be approved for a kind of work.
 *
 * Closes the presentation half of `M2-FE-104`.
 *
 * ## The one thing this screen has to get across
 *
 * *Selecting this does not switch it on.* A Partner who believes picking
 * "Housekeeping staff" opened an agency workspace will wait for enquiries that
 * never come and conclude the platform is dead. So the word "request" is in the
 * button, the review is stated on the card rather than in a footnote, and there
 * is no checkbox anywhere — a checkbox is the interaction that means "on".
 *
 * This is also why skills are not on this screen. Skills live on `/apply/work`
 * and support eligibility; a capability is a separate ask with a separate
 * review, and putting them on one screen is exactly how the two get conflated.
 *
 * ## Why the extra fields come from the server
 *
 * `asks` is `asks_for` from the payload: crew size for workforce, project
 * ceiling for projects. The form renders what the server named. An
 * `if (archetype === …)` here would be the per-archetype branch `SIM-09`
 * removed, and it would be wrong the first time a variant wants both.
 *
 * ## Money
 *
 * The project ceiling is entered in rupees and sent in paise, converted once in
 * the adapter. No float crosses the wire.
 */

export interface CapabilityPickerProps {
  readonly state: AsyncState<CapabilityOptionsView>;
  /**
   * Rupees for money asks, a plain count otherwise. The container converts.
   *
   * `answers` are the category-specific registration answers, as raw strings —
   * the adapter types them per question kind, because `validate_scope` refuses a
   * string where it wants an integer.
   */
  readonly onRequest: (input: {
    variantId: string;
    asks: Record<string, number>;
    answers: Record<string, string>;
  }) => void;
  readonly pendingVariantId?: string | null;
  /** Set when the last request was refused, so the failing card can say so. */
  readonly error?: { readonly variantId: string; readonly message: string } | null;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function CapabilityPicker({
  state,
  onRequest,
  pendingVariantId = null,
  error = null,
  onRetry,
  className,
}: CapabilityPickerProps) {
  return (
    <AsyncSection
      state={state}
      label="Loading the work you can apply for"
      onRetry={onRetry}
      className={className}
      isEmpty={(view) => view.isEmpty}
      empty={
        <EmptyState
          title="Nothing to apply for yet"
          description="The services you have chosen are not open to workforce or project vendors. Adding another service on “Your work” may open one."
        />
      }
    >
      {(view) => (
        <div className={cn("flex flex-col gap-6", className)}>
          {view.byCategory.map((group) => (
            <section key={group.category}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                {group.category}
              </h3>
              <ul className="mt-2 flex list-none flex-col gap-3 p-0">
                {group.choices.map((choice) => (
                  <li key={choice.variantId}>
                    <CapabilityCard
                      choice={choice}
                      pending={pendingVariantId === choice.variantId}
                      error={error?.variantId === choice.variantId ? error.message : null}
                      onRequest={(asks, answers) =>
                        onRequest({ variantId: choice.variantId, asks, answers })
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </AsyncSection>
  );
}

function CapabilityCard({
  choice,
  pending,
  error,
  onRequest,
}: {
  choice: CapabilityChoice;
  pending: boolean;
  error: string | null;
  onRequest: (asks: Record<string, number>, answers: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // `Number("")` is 0, so a blank field and a typed zero converge here — which is
  // correct. Every named field must carry a usable number: "0 workers" is not a
  // smaller answer than 12, it is a different question the server would refuse.
  const askValue = (name: string): number => Number(values[name] ?? "");
  const asks: Record<string, number> = Object.fromEntries(
    choice.asks.map((ask) => [ask.name, askValue(ask.name)]),
  );
  const missingAnswers = unansweredRequired(choice.registrationQuestions.questions, answers);
  const isComplete =
    choice.asks.every((ask) => {
      const value = askValue(ask.name);
      return Number.isFinite(value) && value > 0;
    }) && missingAnswers.length === 0;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-text">{choice.variantName}</h4>
        {choice.alreadyRequested ? <Badge tone="info">Already asked</Badge> : null}
      </div>

      {/* Server-authored plain language. The only lifecycle wording a human reads. */}
      <p className="mt-1 text-sm leading-6 text-text-secondary">{choice.lifecycleExplanation}</p>

      <p className="mt-2 text-sm text-text-secondary">
        {choice.isPlatformPaid
          ? "Vsolve holds each stage of the payment until the customer approves it."
          : "The customer pays you directly."}
      </p>

      {choice.requiresInsurance ? (
        <p className="mt-2 text-sm text-text-secondary">
          You will be asked for worker insurance before this is approved.
        </p>
      ) : null}

      {choice.alreadyRequested ? (
        <p className="mt-3 text-sm text-text-muted">
          You have a live request for this. Its progress is on your capabilities list.
        </p>
      ) : (
        <>
          {choice.asks.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              {choice.asks.map((ask) => (
                <Field
                  key={ask.name}
                  // Rupees on screen, paise on the wire. The unit is in the
                  // label so nobody has to guess what the box wants — a bare
                  // number field for money is how someone types 50,00,000 as
                  // paise and asks for a ceiling of five hundred rupees.
                  label={ask.isMoney ? `${ask.label} (₹)` : ask.label}
                  description={ask.help}
                  required
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={values[ask.name] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [ask.name]: event.target.value }))
                    }
                  />
                </Field>
              ))}
            </div>
          ) : null}

          {/* Category-specific questions, authored by Operations on the
              versioned schema. No client-side branch decides which appear —
              that is the whole reason `registration_questions` is published. */}
          {choice.registrationQuestions.questions.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              {choice.registrationQuestions.questions.map((question) => (
                <RegistrationAnswerField
                  key={question.code}
                  question={question}
                  value={answers[question.code] ?? ""}
                  onChange={(value) =>
                    setAnswers((current) => ({ ...current, [question.code]: value }))
                  }
                />
              ))}
            </div>
          ) : null}

          {/* A question the server asks and this build cannot draw. Named, not
              hidden: a required question dropped silently produces a refusal
              nothing on screen explains. */}
          {choice.registrationQuestions.unsupported.length > 0 ? (
            <p className="mt-3 rounded-control bg-surface-sunken px-3 py-2 text-sm leading-6 text-text-secondary">
              This service asks something your app cannot show yet
              {` (${choice.registrationQuestions.unsupported.join(", ")})`}. Update the app, or ask
              support to record the answer for you.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger-text">
              {error}
            </p>
          ) : null}

          <Button
            className="mt-4"
            disabled={!isComplete}
            loading={pending}
            loadingLabel="Sending your request"
            onClick={() => onRequest(asks, answers)}
          >
            Ask to be approved
          </Button>

          {/* The sentence the whole screen exists for. Beside the button, not in
              a footnote — this is where someone decides what they just did. */}
          <p className="mt-2 text-xs leading-5 text-text-muted">
            We review this before it switches on. Choosing a skill on its own does not open this
            work.
          </p>
        </>
      )}
    </Card>
  );
}

/**
 * One category-specific registration answer.
 *
 * Three kinds, because those are the three `validate_scope` accepts and this
 * build can draw. `SELECT` is refused upstream in
 * `readRegistrationQuestions` — the stored schema carries no option list, so a
 * select would be a free-text box whose answer the server then rejects.
 */
function RegistrationAnswerField({
  question,
  value,
  onChange,
}: {
  question: RegistrationQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  if (question.kind === "BOOLEAN") {
    return (
      <Field label={question.label} required={question.isRequired}>
        <Select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Choose one</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </Select>
      </Field>
    );
  }

  if (question.kind === "INTEGER") {
    return (
      <Field label={question.label} required={question.isRequired}>
        <Input
          type="number"
          inputMode="numeric"
          min={question.minimum ?? undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
    );
  }

  return (
    <Field label={question.label} required={question.isRequired}>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}
