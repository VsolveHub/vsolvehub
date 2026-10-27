import type { ReactNode } from "react";

import { cn } from "./cn";
import { useTOrDefault } from "./i18n";

/**
 * The three summaries that repeat across every M2 screen: where, when, and how
 * many people.
 *
 * They appear on the requirement review, the vendor's enquiry detail, the quote
 * comparison, the engagement header and the Operations timeline — five places
 * that must agree, because a customer and a vendor reading different renderings
 * of the same address or the same dates is how a crew arrives at the wrong site.
 *
 * All three take pre-formatted, pre-authorized values. None of them decide what
 * a reader is allowed to see: masking an address before a vendor accepts is a
 * server decision, and a component that truncated it locally would be holding
 * the full value in the payload it was handed.
 */

/* ---------------------------------------------------------------------------
   Address
   --------------------------------------------------------------------------- */

export interface AddressSummaryProps {
  /**
   * Address lines in reading order, as the server released them.
   *
   * Before a vendor accepts, this is the masked form — an area and a pin code.
   * After acceptance it is the full address. The component cannot tell, and
   * deliberately does not try: `masked` below drives the caption only.
   */
  lines: readonly string[];
  /** Landmark or access note, when one was given. */
  note?: string;
  /**
   * States that precise location follows acceptance.
   *
   * Worth saying out loud rather than letting a vendor conclude the customer
   * left the address blank.
   */
  masked?: boolean;
  className?: string;
}

export function AddressSummary({ lines, note, masked = false, className }: AddressSummaryProps) {
  const tf = useTOrDefault();
  return (
    <div className={cn("text-sm", className)}>
      <address className="not-italic text-text">
        {lines.map((line, index) => (
          <span key={`${index}-${line}`} className="block">
            {line}
          </span>
        ))}
      </address>
      {note ? <p className="mt-1 text-text-secondary">{note}</p> : null}
      {masked ? (
        <p className="mt-1 text-xs text-text-muted">
          {tf("ui.summary.addressMasked", "The full address is shared once you accept.")}
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Schedule
   --------------------------------------------------------------------------- */

export interface ScheduleSummaryProps {
  /** Formatted range or single date, e.g. "12 – 16 August" or "Saturday, 12 August". */
  dates: string;
  /** Formatted time or shift window, e.g. "8:00 am – 5:00 pm". */
  hours?: string;
  /**
   * The hard date after which the work is worthless.
   *
   * Rendered distinctly from the requested dates because it is the one that
   * closes matching automatically (`GAP-001`). A customer who reads it as
   * "preferred by" is a customer who is surprised when their request expires.
   */
  serviceBy?: string;
  /** Says the dates can move. Absent means they cannot. */
  flexible?: boolean;
  className?: string;
}

export function ScheduleSummary({
  dates,
  hours,
  serviceBy,
  flexible = false,
  className,
}: ScheduleSummaryProps) {
  const tf = useTOrDefault();
  return (
    <div className={cn("text-sm", className)}>
      <p className="text-text">
        {dates}
        {hours ? <span className="text-text-secondary"> · {hours}</span> : null}
      </p>
      {flexible ? (
        <p className="mt-0.5 text-xs text-text-secondary">
          {tf("ui.summary.datesCanMove", "Dates can move")}
        </p>
      ) : null}
      {serviceBy ? (
        <p className="mt-1 text-xs font-medium text-warning-text">
          {tf("ui.summary.noLongerUsefulAfter", "No longer useful after {serviceBy}", { serviceBy })}
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   People
   --------------------------------------------------------------------------- */

export interface PersonCountProps {
  /** How many are accounted for. */
  present: number;
  /** How many were agreed. */
  expected: number;
  /** What the count is of, singular. Defaults to a neutral "worker". */
  noun?: string;
  /** Context, e.g. "today" or "on 12 August". */
  qualifier?: string;
  className?: string;
}

/**
 * "4 of 6 workers present today" — the whole of A3 attendance in one line.
 *
 * Supervisor-level by design (`SIM-02`): the platform asks for a count, not for
 * six individual check-ins, and per-worker detail is captured only inside a
 * dispute. Rendering this as six rows of names would re-create the per-worker
 * device dependency the audit removed.
 *
 * A shortfall is shown as a shortfall — the tone changes and the text says so.
 * It is not an error and must not read as one: a partial crew is a normal event
 * with a normal settlement, and alarming a supervisor into cancelling is worse
 * than the shortfall.
 */
export function PersonCount({
  present,
  expected,
  noun,
  qualifier,
  className,
}: PersonCountProps) {
  const tf = useTOrDefault();
  const short = present < expected;
  const resolvedNoun = noun ?? tf("ui.summary.personCount.noun", "worker");
  const plural =
    expected === 1
      ? resolvedNoun
      : noun
        ? `${noun}s`
        : tf("ui.summary.personCount.nounPlural", "workers");

  return (
    <p
      className={cn(
        "text-sm font-medium",
        short ? "text-warning-text" : "text-text",
        className,
      )}
    >
      <span data-numeric className="font-bold">
        {present} of {expected}
      </span>{" "}
      {plural} {tf("ui.summary.personCount.present", "present")}
      {qualifier ? ` ${qualifier}` : ""}
      {short ? (
        <span className="block text-xs font-normal">
          {tf(
            "ui.summary.personCount.shortfall",
            "{count} fewer than agreed. Settlement follows what was confirmed.",
            { count: expected - present },
          )}
        </span>
      ) : null}
    </p>
  );
}

/* ---------------------------------------------------------------------------
   Labelled facts
   --------------------------------------------------------------------------- */

export interface FactListProps {
  items: readonly { label: string; value: ReactNode }[];
  className?: string;
}

/**
 * Label/value pairs for scope, taxes, validity and commission treatment.
 *
 * A real `<dl>`, so the pairing survives without the visual layout — which is
 * the whole point on a quote comparison, where "Total" and "Excludes" mean
 * nothing detached from each other.
 */
export function FactList({ items, className }: FactListProps) {
  return (
    <dl className={cn("m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm", className)}>
      {items.map((item, index) => (
        <div key={`${index}-${item.label}`} className="contents">
          <dt className="text-text-secondary">{item.label}</dt>
          <dd className="m-0 text-right font-medium text-text">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
