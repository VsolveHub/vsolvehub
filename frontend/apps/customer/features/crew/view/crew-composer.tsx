"use client";

import { Button, cn } from "@vsolve/ui";
import { useId } from "react";

import { MobileScreen, ScreenHeading } from "@/features/booking/view/mobile-screen";
import type { RequirementQuestionView } from "@/features/requirement/adapters";

import {
  ROLE_COUNT_CAP,
  crewGenderTotals,
  roleGenderCount,
  rolePeopleCount,
  type CrewGender,
} from "../model/event-flow";
import { NUMBER_FLOOR } from "../model/size";
import { RoleIcon } from "./event-icons";

/**
 * Event staff · 2 — who you need.
 *
 * One row per role the catalogue publishes, each with independent men and women
 * counts. The priced headcount is their sum. A single "Staff" stepper was the
 * whole form before this: it priced correctly and told a lead nothing, because
 * eight people at a wedding are not eight of the same person.
 *
 * Desktop is a table (role · men · women). Phone is stacked cards with the same
 * two steppers. Both read the same answers map, so a resize does not reset a
 * count the customer already set.
 *
 * ## The suggestion is already on the crew
 *
 * "150 guests, buffet" puts serving staff on the roster before this screen
 * opens (`applyServingSuggestion`), so the banner explains a number the customer
 * can already see and adjust, rather than asking them to add it. Every stepper
 * stays theirs: a count they change by hand is never overwritten.
 *
 * ## Roles can be zero, and so can the crew
 *
 * Each gender's floor is zero. Continuing with nobody is allowed here; a live
 * rate still needs at least one person, and that check lives later.
 */

export interface CrewComposerProps {
  roles: readonly RequirementQuestionView[];
  /** The `duration_days` question, when the composer should ask it here. */
  daysQuestion: RequirementQuestionView | null;
  answers: Readonly<Record<string, unknown>>;
  onRoleGender: (code: string, gender: CrewGender, value: number) => void;
  onDays: (value: number) => void;
  /** The rule-of-thumb serving headcount, or null when there is nothing to base it on. */
  suggestion: number | null;
  /** The crowd and style the suggestion was drawn from, for the sentence. */
  suggestionBasis: string | null;
  wide?: boolean;
}

function countOf(value: unknown, floor: number): number {
  return typeof value === "number" && Number.isInteger(value) ? Math.max(floor, value) : floor;
}

export function CrewComposer({
  roles,
  daysQuestion,
  answers,
  onRoleGender,
  onDays,
  suggestion,
  suggestionBasis,
  wide = false,
}: CrewComposerProps) {
  const totals = crewGenderTotals(roles, answers);

  return (
    <div className="flex flex-col gap-4">
      {suggestion !== null ? (
        <div className="flex items-start gap-3 rounded-[16px] border border-info-line bg-info-surface px-3.5 py-3">
          <span
            aria-hidden
            className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface text-info-text"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4">
              <path d="M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM10 6.5v4M10 13.5h.01" />
            </svg>
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

      <div className={wide ? "lg:px-1" : undefined}>
        <div
          className="mb-2 hidden grid-cols-[minmax(0,1fr)_7.5rem_7.5rem] items-center gap-2 px-3 lg:grid"
          aria-hidden
        >
          <span />
          <GenderColumnLabel gender="men" />
          <GenderColumnLabel gender="women" />
        </div>

        <div className="mb-2 flex items-center justify-end gap-2 px-1 lg:hidden" aria-hidden>
          <GenderColumnLabel gender="men" className="w-[7.25rem]" />
          <GenderColumnLabel gender="women" className="w-[7.25rem]" />
        </div>

        <ul className={cn("flex flex-col", wide ? "gap-2.5" : "gap-2")}>
          {roles.map((role) => {
            const men = roleGenderCount(answers, role.code, "men");
            const women = roleGenderCount(answers, role.code, "women");
            const people = rolePeopleCount(answers, role.code);
            return (
              <li key={role.code}>
                <RoleRow
                  role={role}
                  men={men}
                  women={women}
                  chosen={people > 0}
                  onMen={(next) => onRoleGender(role.code, "men", next)}
                  onWomen={(next) => onRoleGender(role.code, "women", next)}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-navy-900 px-4 py-3.5 text-white">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-signal-300">Your crew summary</p>
          <p className="mt-0.5 text-[13px] leading-5 text-white/70">A supervisor on duty is included.</p>
        </div>
        <p aria-live="polite" className="flex shrink-0 flex-wrap items-baseline justify-end gap-x-4 gap-y-1 text-right">
          <span className="text-xl font-bold tabular-nums sm:text-2xl">
            {totals.men} <span className="text-sm font-semibold text-white/70">Men</span>
          </span>
          <span className="text-xl font-bold tabular-nums text-orange-400 sm:text-2xl">
            {totals.women} <span className="text-sm font-semibold text-orange-300/80">Women</span>
          </span>
          <span className="text-xl font-bold tabular-nums sm:text-2xl">
            {totals.people} <span className="text-sm font-semibold text-white/70">People</span>
          </span>
        </p>
      </div>

      {daysQuestion !== null ? (
        <DaysRow
          question={daysQuestion}
          value={countOf(answers[daysQuestion.code], daysQuestion.minimum ?? NUMBER_FLOOR)}
          onChange={onDays}
        />
      ) : null}

      {totals.people === 0 ? (
        <p className="text-sm leading-5 text-text-secondary">
          You can continue with nobody yet. A live rate needs at least one person — add them here or come back.
        </p>
      ) : null}
    </div>
  );
}

const GLYPH = cn(
  "inline-flex size-9 shrink-0 items-center justify-center rounded-full border text-lg leading-none sm:size-10 sm:text-xl",
  "transition-colors duration-fast disabled:cursor-not-allowed disabled:border-line disabled:text-warm-400",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
);

function Stepper({
  labelledBy,
  value,
  floor,
  cap,
  unit,
  onChange,
}: {
  labelledBy: string;
  value: number;
  floor: number;
  cap: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex shrink-0 items-center justify-center gap-1 sm:gap-1.5">
      <button
        type="button"
        disabled={value <= floor}
        aria-label={`Fewer ${unit}`}
        onClick={() => onChange(Math.max(floor, value - 1))}
        className={cn(GLYPH, "border-warm-300 bg-surface text-text-secondary hover:bg-surface-hover")}
      >
        <span aria-hidden>−</span>
      </button>
      <output aria-live="polite" className="min-w-6 text-center text-base font-bold tabular-nums text-text sm:min-w-7 sm:text-lg">
        <span aria-hidden>{value}</span>
        <span className="sr-only">{`${value} ${unit}`}</span>
      </output>
      <button
        type="button"
        disabled={value >= cap}
        aria-label={`More ${unit}`}
        onClick={() => onChange(Math.min(cap, value + 1))}
        className={cn(GLYPH, "border-navy-900 bg-surface text-navy-900 hover:bg-navy-50")}
      >
        <span aria-hidden>+</span>
      </button>
    </div>
  );
}

function GenderColumnLabel({
  gender,
  className,
}: {
  gender: CrewGender;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center justify-center gap-1 text-xs font-bold text-text", className)}>
      <GenderGlyph gender={gender} />
      {gender === "men" ? "Men" : "Women"}
    </span>
  );
}

function GenderGlyph({ gender }: { gender: CrewGender }) {
  if (gender === "men") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className="size-3.5 text-sky-600" aria-hidden>
        <circle cx="7" cy="9.5" r="3.2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9.4 7.1 13 3.5M10.2 3.5H13v2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3.5 text-orange-500" aria-hidden>
      <circle cx="8" cy="6.2" r="3.1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 9.4v4.2M6.1 11.8h3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RoleRow({
  role,
  men,
  women,
  chosen,
  onMen,
  onWomen,
}: {
  role: RequirementQuestionView;
  men: number;
  women: number;
  chosen: boolean;
  onMen: (value: number) => void;
  onWomen: (value: number) => void;
}) {
  const menLabelId = useId();
  const womenLabelId = useId();

  return (
    <div
      className={cn(
        "grid items-center gap-3 rounded-[16px] border px-3 py-3 transition-colors duration-fast",
        "grid-cols-1 sm:py-2.5",
        "lg:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem] lg:gap-2",
        chosen ? "border-selected-line bg-selected-surface" : "border-line bg-surface",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
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
          <span className="block text-sm font-bold leading-5 text-text">
            {role.label}
          </span>
          {role.help ? (
            <span className="mt-0.5 block text-xs leading-4 text-text-secondary">{role.help}</span>
          ) : null}
        </span>
      </div>

      <span id={menLabelId} className="sr-only">
        {`Men, ${role.label}`}
      </span>
      <span id={womenLabelId} className="sr-only">
        {`Women, ${role.label}`}
      </span>

      <div className="flex items-center justify-end gap-2 lg:contents">
        <Stepper
          labelledBy={menLabelId}
          value={men}
          floor={0}
          cap={ROLE_COUNT_CAP}
          unit={`men for ${role.label.toLowerCase()}`}
          onChange={onMen}
        />
        <Stepper
          labelledBy={womenLabelId}
          value={women}
          floor={0}
          cap={ROLE_COUNT_CAP}
          unit={`women for ${role.label.toLowerCase()}`}
          onChange={onWomen}
        />
      </div>
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
  const floor = question.minimum ?? NUMBER_FLOOR;
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-line bg-surface px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span id={labelId} className="block text-sm font-bold leading-5 text-text">
          For how many days?
        </span>
        <span className="mt-0.5 block text-xs leading-4 text-text-secondary">
          {question.help ?? "Consecutive days, 8-hour shifts."}
        </span>
      </span>
      <Stepper
        labelledBy={labelId}
        value={value}
        floor={floor}
        cap={60}
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
  return (
    <MobileScreen
      title="Book event staff"
      onBack={onBack}
      step="Step 2 of 3"
      reassurance="Free. Nothing is booked yet."
      action={
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="h-[50px] min-w-[5.5rem] rounded-[11px] text-[15px]">
            Back
          </Button>
          <Button block onClick={onContinue} className="h-[50px] rounded-[11px] text-[15px]">
            Continue to Date & Venue
          </Button>
        </div>
      }
    >
      <div className="crew-stage-enter flex flex-col gap-4">
        <ScreenHeading eyebrow={serviceName} title="Who do you need?" />
        <CrewComposer {...composer} />
      </div>
    </MobileScreen>
  );
}
