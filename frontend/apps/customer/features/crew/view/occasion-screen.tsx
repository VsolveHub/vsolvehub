"use client";

import { Button, ChoiceChips, Field, Input, cn } from "@vsolve/ui";
import { useId, useState } from "react";

import { FieldLabel, MobileScreen, ScreenHeading } from "@/features/booking/view/mobile-screen";
import { Segmented } from "@/features/booking/view/parts/segmented";
import type { RequirementQuestionView } from "@/features/requirement/adapters";

import {
  EVENT_TYPE_CODE,
  GUEST_BAND_CODE,
  MAX_GUESTS,
  SERVICE_STYLE_CODE,
  isExactGuestCount,
} from "../model/event-flow";

/**
 * The tab that opens the number field. Never stored — choosing it writes a blank answer
 * and the figure the Customer types replaces it, so `guest_band` only ever holds a real
 * band code or a real number.
 */
const CUSTOM_BAND = "__custom__";

/**
 * The published band Custom replaces. Its midpoint (250) was a guess standing in for
 * everything from 200 guests to 2,000, which is precisely the answer worth typing.
 */
const OPEN_ENDED_BAND = "200-plus";
import { EventTypeIcon } from "./event-icons";
import { requiredAnswersPresent } from "./preset-questions";

/**
 * Event staff · 1 — the occasion.
 *
 * Asked first because it is the question a customer answers without thinking,
 * and because the answer shapes the next screen: the crowd and the service
 * style are what let the crew composer suggest a serving headcount.
 */

export interface OccasionFieldsProps {
  questions: readonly RequirementQuestionView[];
  answers: Readonly<Record<string, unknown>>;
  onAnswer: (code: string, value: unknown) => void;
  hiddenCodes?: readonly string[];
  wide?: boolean;
  filterCodes?: readonly string[];
}

export function occasionAnswered(
  questions: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): boolean {
  return requiredAnswersPresent(questions, answers);
}

/** Small checkbox indicator for card selection states. */
function SelectionCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-5 place-items-center rounded-md border transition-all duration-150",
        checked
          ? "border-navy-900 bg-navy-900 text-signal-300 shadow-xs"
          : "border-line-strong bg-white/60 group-hover:border-navy-900/60 dark:bg-surface",
      )}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className={cn(
          "size-3.5 transition-all duration-150 stroke-current",
          checked ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
        strokeWidth="2.5"
      >
        <path d="m3.5 8.5 3 3 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Modern selection cards for "What's the occasion?" */
export function OccasionTypeCards({
  question,
  value,
  onSelect,
  wide = false,
}: {
  question: RequirementQuestionView;
  value: unknown;
  onSelect: (value: string) => void;
  wide?: boolean;
}) {
  const options = question.options ?? [];

  if (!wide) {
    return (
      <div>
        <FieldLabel>{question.label}</FieldLabel>
        <div role="radiogroup" aria-label={question.label} className="grid grid-cols-2 gap-2.5">
          {options.map((option) => {
            const checked = option.value === value;
            return (
              <label
                key={option.value}
                className={cn(
                  "crew-option-enter group relative flex cursor-pointer flex-col items-center justify-center text-center rounded-[20px] border p-3.5",
                  "transition-[border-color,background-color,box-shadow,transform] duration-base ease-out",
                  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                  "active:translate-y-0 active:scale-[0.97] motion-reduce:transform-none",
                  checked
                    ? "border-navy-900 bg-selected-surface shadow-sm ring-1.5 ring-navy-900/10"
                    : "border-line bg-surface shadow-2xs hover:border-line-strong",
                  "min-h-[108px]",
                )}
              >
                <input
                  type="radio"
                  name={question.code}
                  value={option.value}
                  checked={checked}
                  onChange={() => onSelect(option.value)}
                  className="sr-only"
                />
                <div className="absolute right-2.5 top-2.5">
                  <SelectionCheckbox checked={checked} />
                </div>
                <span
                  aria-hidden
                  className={cn(
                    "grid size-11 place-items-center rounded-[14px] transition-all duration-base",
                    checked ? "bg-navy-900 text-signal-300 shadow-xs" : "bg-action-surface text-navy-800",
                  )}
                >
                  <EventTypeIcon code={option.value} className="size-6" />
                </span>
                <span className="mt-2.5 block text-[13.5px] font-bold leading-tight text-navy-950">
                  {option.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <FieldLabel>{question.label}</FieldLabel>
      <div
        role="radiogroup"
        aria-label={question.label}
        className="grid gap-3.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {options.map((option, index) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              style={{ animationDelay: `${Math.min(index, 5) * 40}ms` }}
              className={cn(
                "crew-option-enter group relative flex cursor-pointer flex-col items-center justify-center text-center rounded-[22px] border p-4",
                "transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                "active:translate-y-0 active:scale-[0.97] motion-reduce:transform-none",
                checked
                  ? "border-navy-900 bg-gradient-to-b from-selected-surface to-surface shadow-md ring-2 ring-navy-900/15 dark:bg-selected-surface -translate-y-1"
                  : "border-line/80 bg-surface shadow-2xs hover:-translate-y-1 hover:border-line-strong hover:shadow-sm hover:bg-surface-hover/50",
                "min-h-[120px]",
              )}
            >
              <input
                type="radio"
                name={question.code}
                value={option.value}
                aria-label={option.label}
                checked={checked}
                onChange={() => onSelect(option.value)}
                className="sr-only"
              />

              <div className="absolute right-3 top-3">
                <SelectionCheckbox checked={checked} />
              </div>

              <span
                aria-hidden
                className={cn(
                  "grid size-13 place-items-center rounded-[16px] transition-all duration-200",
                  checked
                    ? "bg-navy-900 text-signal-300 shadow-sm scale-105"
                    : "bg-action-surface/80 text-navy-800 group-hover:bg-action-surface group-hover:text-navy-950 group-hover:scale-105",
                )}
              >
                <EventTypeIcon code={option.value} className="size-7" />
              </span>

              <span className="mt-3 block text-[14.5px] font-bold leading-tight text-navy-950 tracking-tight">
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** Guest count selection cards / chips */
export function GuestBandSelector({
  question,
  value,
  onSelect,
  wide = false,
}: {
  question: RequirementQuestionView;
  value: unknown;
  onSelect: (value: string) => void;
  wide?: boolean;
}) {
  const headingId = useId();
  const exact = isExactGuestCount(value);
  // The open-ended band is the one a midpoint cannot stand in for: "200 or more" resolved
  // to 250, so a 600-guest wedding was staffed for 250. Custom replaces it rather than
  // sitting beside it — two ways to say "a lot" is one too many.
  const bands = (question.options ?? []).filter((option) => option.value !== OPEN_ENDED_BAND);
  const [customOpen, setCustomOpen] = useState(exact);
  const custom = customOpen || exact;

  const tabs = [
    ...bands.map((option) => ({ value: option.value, label: option.label })),
    { value: CUSTOM_BAND, label: "Custom" },
  ];

  function choose(next: string) {
    if (next === CUSTOM_BAND) {
      setCustomOpen(true);
      // Opens blank. Carrying a band's midpoint into the field would put a number in
      // front of the Customer that they never typed, on the field whose whole purpose
      // is that they type it.
      if (!isExactGuestCount(value)) onSelect("");
      return;
    }
    setCustomOpen(false);
    onSelect(next);
  }

  if (!wide) {
    return (
      <div>
        <FieldLabel id={headingId}>{question.label}</FieldLabel>
        <Segmented
          label={question.label}
          labelledBy={headingId}
          name={question.code}
          options={tabs}
          value={custom ? CUSTOM_BAND : typeof value === "string" ? value : null}
          onChange={choose}
        />
        {custom ? (
          <ExactGuestCount questionCode={question.code} value={value} onChange={onSelect} />
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <FieldLabel id={headingId}>{question.label}</FieldLabel>
      <div
        role="radiogroup"
        aria-labelledby={headingId}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {tabs.map((option) => {
          const checked =
            option.value === CUSTOM_BAND ? custom : !custom && option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "group relative flex cursor-pointer flex-col items-center justify-center rounded-[16px] border px-4 py-3.5 text-center",
                "transition-all duration-150 ease-out",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                "active:scale-[0.98] motion-reduce:transform-none",
                checked
                  ? "border-navy-900 bg-selected-surface/50 shadow-sm ring-2 ring-navy-900/10 font-bold"
                  : "border-line bg-surface hover:border-line-strong hover:shadow-sm",
              )}
            >
              <input
                type="radio"
                name={question.code}
                value={option.value}
                aria-label={option.label}
                checked={checked}
                onChange={() => choose(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mb-1.5 grid size-8 place-items-center rounded-full text-xs font-bold transition-colors",
                  checked ? "bg-navy-900 text-signal-300" : "bg-action-surface text-navy-700",
                )}
              >
                <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.8">
                  <path d="M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 17a6 6 0 0 1 12 0" strokeLinecap="round" />
                </svg>
              </span>
              <span className="block text-sm font-bold text-text">{option.label}</span>
              <span className="text-[11px] font-medium text-text-muted">
                {option.value === CUSTOM_BAND ? "your number" : "guests"}
              </span>
            </label>
          );
        })}
      </div>
      {custom ? (
        <ExactGuestCount questionCode={question.code} value={value} onChange={onSelect} />
      ) : null}
    </div>
  );
}

/**
 * "Or enter the exact number" — the answer a band cannot give.
 *
 * ## Why a band was not enough
 *
 * The bands drive `suggestedServers`, which resolves each to a midpoint: "200 or more"
 * meant 250. A 600-guest wedding was therefore staffed for 250 — eight serving staff
 * where twenty are needed — and the customer had no way to say otherwise. Every band
 * carries that error; the open-ended one carries it without limit.
 *
 * ## Why it shares the band's answer rather than adding a question
 *
 * The exact figure is written to `guest_band` itself, as a numeric string. Requirement
 * answers are opaque JSON server-side and validated only for the presence of required
 * codes, so one field holds either shape — no second question, no seed change, no
 * contract change, and nothing downstream has to learn that guests can arrive two ways
 * except the one function that reads them.
 *
 * The bands stay because they are faster for most people. This is the escape hatch, not
 * the replacement.
 */
function ExactGuestCount({
  questionCode,
  value,
  onChange,
}: {
  questionCode: string;
  value: unknown;
  onChange: (value: string) => void;
}) {
  const current = isExactGuestCount(value) ? String(value).trim() : "";

  // No visible label of its own. The question is already answered by the `FieldLabel`
  // above the tabs; repeating it here asked "How many guests?" twice on one screen.
  // The accessible name comes from `aria-label`, which sighted readers never see.
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        id={`${questionCode}-exact`}
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        aria-label="Exact number of guests"
        value={current}
        onChange={(event) => {
          const next = event.currentTarget.value;
          // Digits only, and never past the cap — a typed extra zero should not
          // quietly become a five-figure crowd.
          if (!/^\d*$/.test(next)) return;
          if (next === "") {
            onChange("");
            return;
          }
          const parsed = Number(next);
          if (!Number.isSafeInteger(parsed)) return;
          onChange(String(Math.min(parsed, MAX_GUESTS)));
        }}
        placeholder="e.g. 180"
        autoFocus
        className={cn(
          "h-11 w-24 rounded-control border border-navy-900 bg-surface px-3 text-center",
          "text-base font-bold tabular-nums text-text ring-2 ring-navy-900/10",
          "transition-colors duration-fast focus:border-action focus:bg-action-surface focus:outline-none focus:ring-2 focus:ring-focus-ring",
        )}
      />
      <span className="text-sm font-medium text-text-muted">guests</span>
    </div>
  );
}

/** Food service selection cards */
export function FoodServiceSelector({
  question,
  value,
  onSelect,
  wide = false,
}: {
  question: RequirementQuestionView;
  value: unknown;
  onSelect: (value: string) => void;
  wide?: boolean;
}) {
  const options = question.options ?? [];

  if (!wide) {
    return (
      <div>
        <FieldLabel>{question.label}</FieldLabel>
        <div
          role="radiogroup"
          aria-label={question.label}
          className="grid gap-2 grid-cols-1"
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
                  onChange={() => onSelect(option.value)}
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

  return (
    <div>
      <FieldLabel>{question.label}</FieldLabel>
      <div
        role="radiogroup"
        aria-label={question.label}
        className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      >
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "group relative flex cursor-pointer items-start gap-3.5 rounded-[18px] border p-4",
                "transition-all duration-150 ease-out",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                "active:scale-[0.99] motion-reduce:transform-none",
                checked
                  ? "border-navy-900 bg-selected-surface/50 shadow-sm ring-2 ring-navy-900/10"
                  : "border-line bg-surface hover:border-line-strong hover:shadow-sm",
              )}
            >
              <input
                type="radio"
                name={question.code}
                value={option.value}
                aria-label={option.label}
                checked={checked}
                onChange={() => onSelect(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors duration-fast",
                  checked ? "border-navy-900 bg-navy-900" : "border-line-strong bg-surface group-hover:border-navy-900",
                )}
              >
                <span className={cn("size-2 rounded-full bg-signal-300", checked ? "opacity-100" : "opacity-0")} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-text">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 block text-xs leading-5 text-text-secondary">
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

export function OccasionFields({
  questions,
  answers,
  onAnswer,
  hiddenCodes = [],
  wide = false,
  filterCodes,
}: OccasionFieldsProps) {
  const visibleQuestions = questions.filter(
    (question) =>
      !hiddenCodes.includes(question.code) &&
      (filterCodes === undefined || filterCodes.includes(question.code)),
  );

  return (
    <div className="flex flex-col gap-6">
      {visibleQuestions.map((question) => {
        const value = answers[question.code];
        const options = question.options ?? [];

        if (question.code === EVENT_TYPE_CODE && question.kind === "choice") {
          return (
            <OccasionTypeCards
              key={question.code}
              question={question}
              value={value}
              onSelect={(next) => onAnswer(question.code, next)}
              wide={wide}
            />
          );
        }

        if (question.code === GUEST_BAND_CODE && question.kind === "choice") {
          return (
            <GuestBandSelector
              key={question.code}
              question={question}
              value={value}
              onSelect={(next) => onAnswer(question.code, next)}
              wide={wide}
            />
          );
        }

        if (question.code === SERVICE_STYLE_CODE && question.kind === "choice") {
          return (
            <FoodServiceSelector
              key={question.code}
              question={question}
              value={value}
              onSelect={(next) => onAnswer(question.code, next)}
              wide={wide}
            />
          );
        }

        if (question.kind === "choice" && options.every((option) => !option.description)) {
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
              placeholder="A sentence is enough (e.g. Annual gala dinner for 120 guests)"
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

