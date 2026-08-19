"use client";

import { Button, cn } from "@vsolve/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { MobileScreen } from "@/features/booking/view/mobile-screen";
import type { StageView } from "@/features/engagement/adapters";

/**
 * A3 · 5 — Booked.
 *
 * A receipt, not a lecture. By the time somebody reaches this screen they have
 * read the settlement model three times — on the form, on the waiting screen and
 * in the payment step — and what they want here is operational: which days, how
 * much cash, who is coming. The booking page owns the explanation.
 *
 * ## The days are the engagement's own stages
 *
 * A3 writes one `EngagementStage` per shift-day at confirmation, each carrying
 * `scheduled_on` and the whole crew's cash for that day. So nothing here divides
 * a total by a day count.
 *
 * ## No start time appears anywhere
 *
 * The design shows "9:00 am". The frozen terms carry a shift *length* and no
 * start time, and nothing on this path ever asked the customer for one — so a
 * time here would be an arrival the supervisor never agreed to. The calendar
 * event is all-day for the same reason.
 */

export interface BookedScreenProps {
  /** One per shift-day, in position order. */
  days: readonly StageView[];
  /** The supervisor, from the shift-day roster once a crew is assigned. */
  crewName: string | null;
  /** Helpers beside the supervisor. Null until the roster exists. */
  helperCount: number | null;
  /** The booking-fee receipt reference, once issued. */
  receiptNumber: string | null;
  receiptHref: string | null;
  /** Where the rest of the booking lives. */
  bookingHref: string;
  /** Builds and downloads the calendar file. */
  onAddToCalendar?: () => void;
  onDone: () => void;
  children?: ReactNode;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function formatDay(iso: string | null): string | null {
  if (iso === null) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : DAY_FORMAT.format(date);
}

export function BookedScreen({
  days,
  crewName,
  helperCount,
  receiptNumber,
  receiptHref,
  bookingHref,
  onAddToCalendar,
  onDone,
  children,
}: BookedScreenProps) {
  const firstDay = days[0] ?? null;
  const laterDays = days.slice(1);

  return (
    <MobileScreen
      title="Booked"
      headerAction={
        <button
          type="button"
          onClick={onDone}
          className="px-2 py-1 text-[13px] font-semibold text-text-link"
        >
          Done
        </button>
      }
      reassurance="Attendance and daily settlement live there."
      reassurancePosition="below"
      action={
        <Link href={bookingHref} className="block">
          <Button block className="h-[50px] rounded-[11px] text-[15px]">
            Open this booking
          </Button>
        </Link>
      }
    >
      <div className="flex flex-col items-center pt-2 text-center">
        <span
          aria-hidden
          className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-success-text text-2xl text-text-inverse"
        >
          ✓
        </span>
        <h2 className="mt-3 text-[23px] font-bold leading-7 text-text">
          Your crew is confirmed
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {describeCrew(crewName, helperCount)}
        </p>
      </div>

      {firstDay !== null ? (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
          <div className="flex items-center justify-between gap-3 px-3.5 py-3.5">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-text-muted">
                {firstDay.label}
              </p>
              <p className="mt-0.5 text-base font-bold text-text">
                {formatDay(firstDay.scheduledOn) ?? "Date to be confirmed"}
              </p>
            </div>
            {onAddToCalendar !== undefined ? (
              <Button variant="outline" size="sm" onClick={onAddToCalendar} className="h-10 shrink-0">
                Add to calendar
              </Button>
            ) : null}
          </div>

          {laterDays.map((day) => (
            <div key={day.stageId} className="border-t border-line px-3.5 py-3">
              <p className="text-[13px] text-text-secondary">
                {day.label} — {formatDay(day.scheduledOn) ?? "date to be confirmed"}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {firstDay !== null ? (
        <div className="rounded-[14px] border border-warning-line bg-warning-surface p-[15px]">
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-warning-text">
            Have ready on day 1
          </p>
          <p className="mt-1 text-[32px] font-extrabold leading-9 tabular-nums text-text">
            {firstDay.amountLabel}
          </p>
          <p className="mt-1 text-[13px] leading-5 text-text-secondary">
            Cash, to {crewName ?? "your supervisor"}, at the end of the day.
          </p>
        </div>
      ) : null}

      {receiptNumber !== null ? (
        <div className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-text">Booking fee receipt</p>
            <p className={cn("mt-0.5 truncate text-[13px] tabular-nums text-text-muted")}>
              {receiptNumber}
            </p>
          </div>
          {receiptHref !== null ? (
            <Link
              href={receiptHref}
              className="shrink-0 text-[13px] font-semibold text-text-link underline underline-offset-2"
            >
              View
            </Link>
          ) : null}
        </div>
      ) : null}

      {children}
    </MobileScreen>
  );
}

/** "Ramesh K. and 2 helpers", or as much of it as the roster gave us. */
function describeCrew(crewName: string | null, helperCount: number | null): string {
  if (crewName === null) {
    return "Your supervisor will be in touch before the first day.";
  }
  if (helperCount === null || helperCount <= 0) return crewName;
  return `${crewName} and ${helperCount} ${helperCount === 1 ? "helper" : "helpers"}`;
}
