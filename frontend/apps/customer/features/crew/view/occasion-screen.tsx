"use client";

import { Button, ChoiceChips, Field, Input, cn } from "@vsolve/ui";

import { FieldLabel, MobileScreen, ScreenHeading } from "@/features/booking/view/mobile-screen";
import { Segmented } from "@/features/booking/view/parts/segmented";
import type { RequirementQuestionView } from "@/features/requirement/adapters";

import { EVENT_TYPE_CODE } from "../model/event-flow";
import { EventTypeIcon } from "./event-icons";
import { requiredAnswersPresent } from "./preset-questions";

/**
 * Event staff · 1 — the occasion.
 *
 * Asked first because it is the question a customer answers without thinking,
 * and because the answer shapes the next screen: the crowd and the service
 * style are what let the crew composer suggest a serving headcount. Everything
 * rendered here is the catalogue's own question list; this screen only decides
 * which control each shape gets.
 *
 * The occasion is a grid of tiles rather than a column of cards — five options
 * with a picture each fit on one phone screen, where five described cards do
 * not. The description survives as the tile's second line on a wide screen and
 * as the selected tile's caption on a phone.
 */

export interface OccasionFieldsProps {
  questions: readonly RequirementQuestionView[];
  answers: Readonly<Record<string, unknown>>;
  onAnswer: (code: string, value: unknown) => void;
  hiddenCodes?: readonly string[];
  wide?: boolean;
}

export function occasionAnswered(
  questions: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): boolean {
  return requiredAnswersPresent(questions, answers);
}

export function OccasionFields({
  questions,
  answers,
  onAnswer,
  hiddenCodes = [],
  wide = false,
}: OccasionFieldsProps) {
  return (
    <div className="flex flex-col gap-6">
      {questions.map((question) => {
        if (hiddenCodes.includes(question.code)) return null;
        const value = answers[question.code];
        const options = question.options ?? [];

        if (question.code === EVENT_TYPE_CODE && question.kind === "choice") {
          const selected = options.find((option) => option.value === value) ?? null;
          return (
            <div key={question.code}>
              <FieldLabel>{question.label}</FieldLabel>
              <div
                role="radiogroup"
                aria-label={question.label}
                className={cn("grid gap-2.5", wide ? "sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2")}
              >
                {options.map((option, index) => {
                  const checked = option.value === value;
                  return (
                    <label
                      key={option.value}
                      style={{ animationDelay: `${Math.min(index, 5) * 40}ms` }}
                      className={cn(
                        "crew-option-enter group flex cursor-pointer flex-col items-start gap-2.5 rounded-[18px] border p-3.5 text-left",
                        "transition-[border-color,background-color,box-shadow,transform] duration-base ease-out",
                        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                        "active:translate-y-0 active:scale-[0.99] motion-reduce:transform-none",
                        checked
                          ? "-translate-y-0.5 border-selected bg-selected-surface shadow-raised"
                          : "border-line bg-surface shadow-card hover:-translate-y-0.5 hover:border-line-strong",
                        wide ? "min-h-[132px]" : "min-h-[104px]",
                      )}
                    >
                      <input
                        type="radio"
                        name={question.code}
                        value={option.value}
                        checked={checked}
                        onChange={() => onAnswer(question.code, option.value)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-11 place-items-center rounded-[13px] transition-colors duration-base",
                          checked ? "bg-navy-900 text-signal-300" : "bg-action-surface text-navy-700",
                        )}
                      >
                        <EventTypeIcon code={option.value} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-bold leading-5 text-text">
                          {option.label}
                        </span>
                        {wide && option.description ? (
                          <span className="mt-1 block text-[13px] leading-5 text-text-secondary">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              {!wide && selected?.description ? (
                <p className="mt-2.5 text-[13px] leading-5 text-text-secondary" aria-live="polite">
                  {selected.description}
                </p>
              ) : null}
            </div>
          );
        }

        if (question.kind === "choice" && options.every((option) => !option.description)) {
          // A short scale — the guest bands — as one joined track.
          return (
            <div key={question.code}>
              <FieldLabel>{question.label}</FieldLabel>
              {wide ? (
                <ChoiceChips
                  label={question.label}
                  name={question.code}
                  layout="bar"
                  options={options.map((option) => ({ value: option.value, label: option.label }))}
                  value={typeof value === "string" ? value : null}
                  onChange={(next) => onAnswer(question.code, next)}
                  className="max-w-xl"
                />
              ) : (
                <Segmented
                  label={question.label}
                  name={question.code}
                  options={options.map((option) => ({ value: option.value, label: option.label }))}
                  value={typeof value === "string" ? value : null}
                  onChange={(next) => onAnswer(question.code, next)}
                />
              )}
            </div>
          );
        }

        if (question.kind === "choice") {
          // Described options — how food is served — keep their sentence, as a
          // compact row each rather than a card.
          return (
            <div key={question.code}>
              <FieldLabel>{question.label}</FieldLabel>
              <div
                role="radiogroup"
                aria-label={question.label}
                className={cn("grid gap-2", wide ? "sm:grid-cols-2" : "grid-cols-1")}
              >
                {options.map((option) => {
                  const checked = option.value === value;
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        "flex min-h-14 cursor-pointer items-center gap-3 rounded-[14px] border px-3.5 py-2.5",
                        "transition-colors duration-fast",
                        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                        checked
                          ? "border-selected bg-selected-surface"
                          : "border-line bg-surface hover:border-line-strong",
                      )}
                    >
                      <input
                        type="radio"
                        name={question.code}
                        value={option.value}
                        checked={checked}
                        onChange={() => onAnswer(question.code, option.value)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors duration-fast",
                          checked ? "border-selected bg-selected" : "border-line-strong bg-surface",
                        )}
                      >
                        <span className={cn("size-2 rounded-full bg-white", checked ? "opacity-100" : "opacity-0")} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-text">{option.label}</span>
                        {option.description ? (
                          <span className="block text-[13px] leading-5 text-text-secondary">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        }

        // The sentence behind "Something else", and anything else the catalogue adds.
        return (
          <Field
            key={question.code}
            label={question.label}
            description={question.help}
            required={question.required}
          >
            <Input
              value={typeof value === "string" ? value : ""}
              onChange={(event) => onAnswer(question.code, event.target.value)}
              placeholder="A sentence is enough"
            />
          </Field>
        );
      })}
    </div>
  );
}

export interface OccasionScreenProps extends OccasionFieldsProps {
  serviceName: string;
  onContinue: () => void;
  onBack: () => void;
}

export function OccasionScreen({
  serviceName,
  questions,
  answers,
  onAnswer,
  hiddenCodes,
  onContinue,
  onBack,
}: OccasionScreenProps) {
  const complete = occasionAnswered(questions, answers);
  return (
    <MobileScreen
      title="Book event staff"
      onBack={onBack}
      step="Step 1 of 3"
      reassurance="Choosing here creates no request."
      action={
        <Button
          block
          onClick={onContinue}
          disabled={!complete}
          className="h-[50px] rounded-[11px] text-[15px]"
        >
          {complete ? "Build the crew" : "Tell us about the event to continue"}
        </Button>
      }
    >
      <div className="crew-stage-enter flex flex-col gap-5">
        <ScreenHeading eyebrow={serviceName} title="Tell us about the event" />
        <OccasionFields
          questions={questions}
          answers={answers}
          onAnswer={onAnswer}
          hiddenCodes={hiddenCodes}
        />
      </div>
    </MobileScreen>
  );
}
