"use client";

import { Button, cn } from "@vsolve/ui";
import { useId } from "react";

import { MobileScreen, ScreenHeading } from "@/features/booking/view/mobile-screen";
import type { RequirementQuestionView } from "@/features/requirement/adapters";

import { NUMBER_FLOOR } from "../model/size";
import { RoleIcon } from "./event-icons";

/**
 * Event staff · 2 — who you need.
 *
 * One row per role the catalogue publishes, each with its own count, and the
 * priced headcount shown as their sum. A single "Staff" stepper was the whole
 * form before this: it priced correctly and told a lead nothing, because eight
 * people at a wedding are not eight of the same person.
 *
 * ## The suggestion is already on the crew
 *
 * "150 guests, buffet" puts five serving staff on the roster before this screen
 * opens (`applyServingSuggestion`), so the banner explains a number the customer
 * can already see and adjust, rather than asking them to add it. Every stepper
 * stays theirs: a count they change by hand is never overwritten.
 *
 * ## Roles can be zero, the crew cannot
 *
 * Each role's floor is the catalogue's own minimum (zero), so a customer can
 * ask for four waiters and no bar staff. The **total** is what the rate card
 * prices and the caller keeps it at one or more before it lets the flow
 * continue — a crew of nobody is not a smaller booking, it is no booking.
 */

export interface CrewComposerProps {
  roles: readonly RequirementQuestionView[];
  /** The `duration_days` question, when the composer should ask it here. */
  daysQuestion: RequirementQuestionView | null;
  answers: Readonly<Record<string, unknown>>;
  onRoleCount: (code: string, value: number) => void;
  onDays: (value: number) => void;
  /** The rule-of-thumb serving headcount, or null when there is nothing to base it on. */
  suggestion: number | null;
  /** The crowd and style the suggestion was drawn from, for the sentence. */
  suggestionBasis: string | null;
  total: number;
  wide?: boolean;
}

function countOf(value: unknown, floor: number): number {
  return typeof value === "number" && Number.isInteger(value) ? Math.max(floor, value) : floor;
}

export function CrewComposer({
  roles,
  daysQuestion,
  answers,
  onRoleCount,
  onDays,
  suggestion,
  suggestionBasis,
  total,
  wide = false,
}: CrewComposerProps) {
  return (
    <div className="flex flex-col gap-4">
      {suggestion !== null ? (
        <div className="flex items-start gap-3 rounded-[16px] border border-info-line bg-info-surface px-3.5 py-3">
          <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface text-info-text">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4"><path d="M10 3.5a4.5 4.5 0 0 0-2.5 8.2V14h5v-2.3A4.5 4.5 0 0 0 10 3.5ZM8.5 16.5h3" /></svg>
          </span>
          <p className="text-[13px] leading-5 text-text">
            {suggestionBasis === null ? "We have started you with" : `For ${suggestionBasis} we have started you with`}{" "}
            <strong className="font-bold">
              {suggestion} serving {suggestion === 1 ? "person" : "staff"}
            </strong>
            . Adjust any role — the crew is yours to set.
          </p>
        </div>
      ) : null}

      <ul className={cn("flex flex-col", wide ? "gap-2.5" : "gap-2")}>
        {roles.map((role) => {
          const floor = role.minimum ?? 0;
          return (
            <li key={role.code}>
              <RoleRow
                role={role}
                value={countOf(answers[role.code], floor)}
                floor={floor}
                onChange={(next) => onRoleCount(role.code, next)}
              />
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-3 rounded-[16px] bg-navy-900 px-4 py-3.5 text-white">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-signal-300">Your crew</p>
          <p className="mt-0.5 text-[13px] leading-5 text-white/70">A supervisor on duty is included.</p>
        </div>
        <p aria-live="polite" className="shrink-0 text-2xl font-bold tabular-nums">
          {total} <span className="text-sm font-semibold text-white/70">{total === 1 ? "person" : "people"}</span>
        </p>
      </div>

      {daysQuestion !== null ? (
        <DaysRow
          question={daysQuestion}
          value={countOf(answers[daysQuestion.code], daysQuestion.minimum ?? NUMBER_FLOOR)}
          onChange={onDays}
        />
      ) : null}
    </div>
  );
}

const GLYPH = cn(
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full border text-xl leading-none",
  "transition-colors duration-fast disabled:cursor-not-allowed disabled:border-line disabled:text-warm-400",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
);

function Stepper({
  labelId,
  value,
  floor,
  unit,
  onChange,
}: {
  labelId: string;
  value: number;
  floor: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div role="group" aria-labelledby={labelId} className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        disabled={value <= floor}
        aria-label={`Fewer ${unit}`}
        onClick={() => onChange(Math.max(floor, value - 1))}
        className={cn(GLYPH, "border-warm-300 bg-surface text-text-secondary hover:bg-surface-hover")}
      >
        <span aria-hidden>−</span>
      </button>
      <output aria-live="polite" className="min-w-7 text-center text-lg font-bold tabular-nums text-text">
        <span aria-hidden>{value}</span>
        <span className="sr-only">{`${value} ${unit}`}</span>
      </output>
      <button
        type="button"
        aria-label={`More ${unit}`}
        onClick={() => onChange(value + 1)}
        className={cn(GLYPH, "border-navy-900 bg-surface text-navy-900 hover:bg-navy-50")}
      >
        <span aria-hidden>+</span>
      </button>
    </div>
  );
}

function RoleRow({
  role,
  value,
  floor,
  onChange,
}: {
  role: RequirementQuestionView;
  value: number;
  floor: number;
  onChange: (value: number) => void;
}) {
  const labelId = useId();
  const chosen = value > floor;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[16px] border px-3 py-2.5 transition-colors duration-fast",
        chosen ? "border-selected-line bg-selected-surface" : "border-line bg-surface",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-[12px] transition-colors duration-base",
          chosen ? "bg-navy-900 text-signal-300" : "bg-action-surface text-navy-700",
        )}
      >
        <RoleIcon code={role.code} />
      </span>
      <span className="min-w-0 flex-1">
        <span id={labelId} className="block text-sm font-bold leading-5 text-text">
          {role.label}
        </span>
        {role.help ? (
          <span className="mt-0.5 block text-xs leading-4 text-text-secondary">{role.help}</span>
        ) : null}
      </span>
      <Stepper
        labelId={labelId}
        value={value}
        floor={floor}
        unit={role.label.toLowerCase()}
        onChange={onChange}
      />
    </div>
  );
}

function DaysRow({
  question,
  value,
  onChange,
}: {
  question: RequirementQuestionView;
  value: number;
  onChange: (value: number) => void;
}) {
  const labelId = useId();
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-line bg-surface px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span id={labelId} className="block text-sm font-bold leading-5 text-text">
          For how many days?
        </span>
        {question.help ? (
          <span className="mt-0.5 block text-xs leading-4 text-text-secondary">{question.help}</span>
        ) : null}
      </span>
      <Stepper
        labelId={labelId}
        value={value}
        floor={question.minimum ?? NUMBER_FLOOR}
        unit={question.label.toLowerCase()}
        onChange={onChange}
      />
    </div>
  );
}

export interface CrewScreenProps extends Omit<CrewComposerProps, "wide"> {
  serviceName: string;
  onContinue: () => void;
  onBack: () => void;
}

export function CrewScreen({ serviceName, onContinue, onBack, ...composer }: CrewScreenProps) {
  const ready = composer.total > 0;
  return (
    <MobileScreen
      title="Book event staff"
      onBack={onBack}
      step="Step 2 of 3"
      reassurance="Free. Nothing is booked yet."
      action={
        <Button
          block
          onClick={onContinue}
          disabled={!ready}
          className="h-[50px] rounded-[11px] text-[15px]"
        >
          {ready ? "Continue" : "Add at least one person"}
        </Button>
      }
    >
      <div className="crew-stage-enter flex flex-col gap-4">
        <ScreenHeading eyebrow={serviceName} title="Who do you need?" />
        <CrewComposer {...composer} />
      </div>
    </MobileScreen>
  );
}
