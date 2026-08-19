"use client";

import { Button, Disclosure, ErrorState, Input, Field } from "@vsolve/ui";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  FieldLabel,
  MobileScreen,
  ScreenHeading,
} from "@/features/booking/view/mobile-screen";
import { ChipGroup } from "@/features/booking/view/parts/chip-group";
import { CounterCard } from "@/features/booking/view/parts/counter-card";
import { DateSheet } from "@/features/booking/view/parts/date-sheet";
import { PickerRow } from "@/features/booking/view/parts/picker-row";
import { Segmented } from "@/features/booking/view/parts/segmented";
import type { RequirementQuestionView } from "@/features/requirement/adapters";
import { NUMBER_FLOOR } from "../../model/size";

/**
 * A3 · 1 — Tell us the job.
 *
 * Step one of two on a phone. The rate is step two rather than a column beside
 * this one, because a 390px screen has no beside.
 *
 * ## What is deliberately not on this screen
 *
 * Three paragraphs that used to be: what a draft is, when the request closes,
 * and what asking for a price costs. All three answer questions nobody has while
 * filling in a form, and the one that mattered — that this is free and books
 * nothing — is the footer's single line, where it is read immediately before the
 * only tap that matters.
 *
 * The desktop instruction "set the job on the left, the rate on the right" is
 * gone for the obvious reason.
 *
 * ## Controls are chosen from the catalogue's data, not from a list of codes
 *
 * A `number` question becomes a counter card, a short choice list becomes chips.
 * Which questions exist is the server's, so a variant that publishes different
 * ones still renders — it simply renders them with the same three controls.
 */

export interface JobFormScreenProps {
  /** The eyebrow above the heading — the service being booked. */
  serviceName: string;
  questions: readonly RequirementQuestionView[];
  answers: Readonly<Record<string, unknown>>;
  onAnswer: (questionCode: string, value: unknown) => void;
  /** Question codes to leave unrendered. The caller decides, never this screen. */
  hiddenCodes?: readonly string[];

  /** `YYYY-MM-DD`, or null. */
  requestedStart: string | null;
  onRequestedStart: (isoDate: string) => void;

  /** The chosen address as one line, or null. */
  addressLine: string | null;
  /** Opens the address dialog. The picker itself is rendered by the caller. */
  onOpenAddress: () => void;
  /** The address dialog, mounted by the caller so this screen owns no data. */
  addressPicker?: ReactNode;

  /** True once every required answer, the address and the date are present. */
  canContinue: boolean;
  isSaving: boolean;
  onContinue: () => void;
  saveError?: ReactNode;
  onBack: () => void;
}

/** The day, in the customer's own locale. Built from parts, never from `new Date(iso)`. */
function formatDay(isoDate: string | null): string | null {
  if (isoDate === null) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(new Date(year, month - 1, day));
}

/** Short, undescribed option lists suit chips. Anything longer keeps a select. */
function fitsOnChips(question: RequirementQuestionView): boolean {
  const options = question.options ?? [];
  return options.length > 0 && options.length <= 8;
}

export function JobFormScreen({
  serviceName,
  questions,
  answers,
  onAnswer,
  hiddenCodes = [],
  requestedStart,
  onRequestedStart,
  addressLine,
  onOpenAddress,
  addressPicker,
  canContinue,
  isSaving,
  onContinue,
  saveError,
  onBack,
}: JobFormScreenProps) {
  const [dateOpen, setDateOpen] = useState(false);

  // Counters are paired into a two-up grid, which is what makes People and Days
  // read as one question about size rather than two unrelated fields.
  const counters = questions.filter(
    (question) => question.kind === "number" && !hiddenCodes.includes(question.code),
  );
  const others = questions.filter(
    (question) => question.kind !== "number" && !hiddenCodes.includes(question.code),
  );

  return (
    <MobileScreen
      title="Book a crew"
      onBack={onBack}
      step="Step 1 of 2"
      reassurance="Free. Nothing is booked yet."
      action={
        <Button
          block
          onClick={onContinue}
          disabled={!canContinue}
          loading={isSaving}
          loadingLabel="Checking the rate"
          className="h-[50px] rounded-[11px] text-[15px]"
        >
          See the rate
        </Button>
      }
    >
      <ScreenHeading eyebrow={serviceName} title="Tell us the job" />

      {others.map((question) => (
        <div key={question.code}>
          <FieldLabel>{question.label}</FieldLabel>
          {question.kind === "choice" && fitsOnChips(question) ? (
            <>
              <ChipGroup
                label={question.label}
                name={question.code}
                options={(question.options ?? []).map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={typeof answers[question.code] === "string" ? (answers[question.code] as string) : null}
                onChange={(value) => onAnswer(question.code, value)}
              />
              {/* The option descriptions the desktop form renders inline. One
                  disclosure under the group rather than two lines against every
                  chip — same words, a screen of scrolling less. */}
              {(question.options ?? []).some((option) => option.description) ? (
                <div className="mt-2">
                  <Disclosure summary="What these mean" hint={`${(question.options ?? []).length} options`}>
                    <dl className="flex flex-col gap-2">
                      {(question.options ?? [])
                        .filter((option) => option.description)
                        .map((option) => (
                          <div key={option.value}>
                            <dt className="font-semibold text-text">{option.label}</dt>
                            <dd>{option.description}</dd>
                          </div>
                        ))}
                    </dl>
                  </Disclosure>
                </div>
              ) : null}
            </>
          ) : question.kind === "boolean" ? (
            <Segmented
              label={question.label}
              name={question.code}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
              value={
                answers[question.code] === true
                  ? "yes"
                  : answers[question.code] === false
                    ? "no"
                    : null
              }
              onChange={(value) => onAnswer(question.code, value === "yes")}
            />
          ) : (
            <Field label={question.label} description={question.help}>
              <Input
                value={typeof answers[question.code] === "string" ? (answers[question.code] as string) : ""}
                onChange={(event) => onAnswer(question.code, event.target.value)}
              />
            </Field>
          )}
        </div>
      ))}

      {counters.length > 0 ? (
        <div className="grid grid-cols-2 gap-2.5">
          {counters.map((question) => {
            const floor = question.minimum ?? NUMBER_FLOOR;
            const current =
              typeof answers[question.code] === "number"
                ? (answers[question.code] as number)
                : floor;
            return (
              <CounterCard
                key={question.code}
                label={question.label}
                value={current}
                min={floor}
                unit={question.label.toLowerCase()}
                onChange={(next) => onAnswer(question.code, next)}
              />
            );
          })}
        </div>
      ) : null}

      {/* The hints the counters carry on desktop, kept but moved off the cards —
          two lines of help under a two-up grid is what pushes the date row below
          the fold. */}
      {counters.some((question) => question.help !== undefined) ? (
        <p className="-mt-1 text-xs leading-5 text-text-muted">
          {counters
            .map((question) => question.help)
            .filter(Boolean)
            .join(" ")}
        </p>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <PickerRow
          label="Start from"
          value={formatDay(requestedStart)}
          placeholder="Choose a date"
          onOpen={() => setDateOpen(true)}
        />
        <PickerRow
          label="Where"
          value={addressLine}
          placeholder="Choose where the work is"
          onOpen={onOpenAddress}
          trailing="word"
          emphasis
        />
      </div>

      {saveError}

      <DateSheet
        open={dateOpen}
        onOpenChange={setDateOpen}
        value={requestedStart}
        onSelect={onRequestedStart}
      />

      {addressPicker}
    </MobileScreen>
  );
}

/** The save failure, in the shape this screen renders it. */
export function JobFormError({ message }: { message: string }) {
  return <ErrorState title="We could not save that" message={message} severity="error" inline />;
}
