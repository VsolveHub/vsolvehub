"use client";

import { RailHeadline, RailLayout, cn, useIsWideScreen } from "@vsolve/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { confirmedCrewName, toFeeMoneyView } from "@/features/crew/adapters";
import { useRateCardState } from "@/features/crew/queries";
import { BookedScreen } from "@/features/crew/view/mobile/booked-screen";
import { toShiftDayView } from "@/features/shift-day/adapters";
import { useShiftDay } from "@/features/shift-day/queries";
import type { EngagementView, StageView } from "../adapters";
import { buildCrewCalendar, calendarStamp } from "../model/calendar";

/**
 * The confirmed crew booking, as a receipt — `M2-FE-429`.
 *
 * ## Why this is not another explanation
 *
 * By the time a Customer reaches this screen they have read the settlement model
 * three times: on the booking form, on the waiting screen, and in the payment
 * dialog. What they want here is operational — **which days, what time, how much
 * cash to have in hand, and who is coming** — and the previous version of this
 * screen answered those below several paragraphs re-teaching them how A3 works.
 *
 * So the days are the content. Each is its own card with its own cash figure,
 * because "₹5,100 across two days" is a number nobody can act on and "₹2,550 on
 * Monday" is one they can put in an envelope.
 *
 * ## The days are the engagement's own stages
 *
 * A3 creates one `EngagementStage` per shift-day at confirmation, each carrying
 * `scheduled_on` and `amount_paise` — the whole crew's cash for that day. So
 * nothing here divides a total by a day count or invents a schedule; the cards
 * are rows the server already wrote, rendered in position order.
 */

export interface CrewBookingSummaryProps {
  view: EngagementView;
  /** Where the receipt document is read. Null until a receipt exists. */
  receiptHref: string | null;
  /** Where the rest of the booking lives — attendance, settlement, amendments. */
  detailAnchor: string;
  /** Rendered under the rail. The day controls, when there are any. */
  children?: ReactNode;
}

/**
 * Reads its own rate-card state, on `CrewDayPanel`'s precedent.
 *
 * The supervisor's name, the headcount and the shift length live on
 * `RateCardState`, not on the engagement projection — the engagement knows what
 * was agreed and how much, and the booking knows who and how many. Reading it
 * here rather than threading five props down from a screen that does not have
 * them keeps the seam where the data actually is.
 *
 * Renders the summary without those facts if the read has not answered. A
 * confirmation screen that waits on a second request before showing anything is
 * a blank page at the moment somebody most wants to see their booking.
 */
export function CrewBookingSummary({
  view,
  receiptHref,
  detailAnchor,
  children,
}: CrewBookingSummaryProps) {
  const isWide = useIsWideScreen();
  const rateQuery = useRateCardState(view.requirementId);
  const state = rateQuery.data ?? null;
  const booking = state?.booking ?? null;
  const fee = state?.booking_fee ?? null;

  const crewName = state === null ? null : confirmedCrewName(state);
  const headcount = booking?.headcount ?? null;
  const standardDayHours = booking?.standard_day_hours ?? null;
  const receiptNumber = fee === null ? null : toFeeMoneyView(fee).receiptNumber;

  const days = view.stages;

  /**
   * The first day's roster, for the helper count and the verified flag.
   *
   * Read from the shift-day rather than derived from `headcount - 1`, because
   * the crew is assigned **per day by the partner** and may not exist yet: on a
   * freshly-confirmed booking there is nobody on it. Subtracting one from the
   * headcount would print "and 2 helpers" against a roster that names nobody,
   * which is a claim about who is coming.
   */
  const firstStageId = days[0]?.stageId ?? null;
  const shiftQuery = useShiftDay(view.engagementId, firstStageId, firstStageId !== null);
  const shift = shiftQuery.data === undefined ? null : toShiftDayView(shiftQuery.data);
  const supervisor = shift?.crew.find((member) => member.isSupervisor) ?? null;
  const helperCount = shift === null || !shift.hasCrew
    ? null
    : shift.crew.filter((member) => !member.isSupervisor).length;

  function downloadCalendar() {
    const file = buildCrewCalendar(
      {
        // The engagement projection carries no service name, so the calendar
        // event is titled generically rather than with a name invented here.
        service: "Crew booking",
        crewName: supervisor?.displayName ?? crewName,
        days: days
          .filter((day) => day.scheduledOn !== null)
          .map((day) => ({ date: day.scheduledOn as string, label: day.label })),
        url: typeof window === "undefined" ? undefined : window.location.href,
      },
      calendarStamp(new Date()),
    );
    // A blob the browser saves. No endpoint, no authorisation question, and no
    // failure mode for a file assembled from data already on the screen.
    const url = URL.createObjectURL(new Blob([file], { type: "text/calendar" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "crew-booking.ics";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!isWide) {
    return (
      <BookedScreen
        days={days}
        crewName={supervisor?.displayName ?? crewName}
        helperCount={helperCount}
        receiptNumber={receiptNumber}
        receiptHref={receiptHref}
        bookingHref={detailAnchor}
        onAddToCalendar={days.some((day) => day.scheduledOn !== null) ? downloadCalendar : undefined}
        onDone={() => window.history.back()}
      >
        {children}
      </BookedScreen>
    );
  }
  const firstDay = days[0] ?? null;

  return (
    <RailLayout
      railLabel="What to have ready"
      rail={
        <div className="flex flex-col gap-3">
          {/* The hero is the cash for **day one**, not the booking total. It is
              the only figure on this screen somebody has to act on before
              tomorrow morning, and the total is already stated in the day cards
              beside it. */}
          <RailHeadline
            eyebrow="Have ready on day 1"
            value={firstDay?.amountLabel ?? "—"}
            footnote={
              crewName === null
                ? "Cash, to your supervisor, at the end of the day."
                : `Cash, to ${crewName}, at the end of the day.`
            }
          />

          {receiptNumber !== null ? (
            <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">Booking fee receipt</p>
                <p data-numeric className="mt-0.5 truncate text-sm tabular-nums text-text-muted">
                  {receiptNumber}
                </p>
              </div>
              {receiptHref !== null ? (
                <Link
                  href={receiptHref}
                  className="shrink-0 text-sm font-semibold text-text-link underline underline-offset-2"
                >
                  View
                </Link>
              ) : null}
            </div>
          ) : null}

          {children}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <header>
          <h2 className="text-2xl font-bold text-text">Your crew is confirmed</h2>
          <p className="mt-1 text-[0.9375rem] leading-6 text-text-secondary">
            {describeCrew(crewName, headcount)}
          </p>
        </header>

        {days.length > 0 ? (
          <section aria-labelledby="crew-days">
            <h3 id="crew-days" className="text-sm font-bold text-text">
              {days.length === 1 ? "Your day" : `Your ${days.length} days`}
            </h3>
            <ol className="mt-2 grid list-none gap-3 p-0 sm:grid-cols-2">
              {days.map((day) => (
                <DayCard
                  key={day.stageId}
                  day={day}
                  headcount={headcount}
                  standardDayHours={standardDayHours}
                />
              ))}
            </ol>
          </section>
        ) : null}

        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          Attendance and each day&rsquo;s settlement are below. You pay the crew in
          cash at the end of every day — we never hold that money.
        </p>

        <a
          href={detailAnchor}
          className="text-sm font-semibold text-text-link underline underline-offset-2"
        >
          Jump to attendance and settlement
        </a>
      </div>
    </RailLayout>
  );
}

/** "Ramesh K. and 2 helpers", or as much of it as the server published. */
function describeCrew(crewName: string | null, headcount: number | null): string {
  const helpers = headcount === null ? null : headcount - 1;
  if (crewName === null) {
    return headcount === null
      ? "Your supervisor will be in touch before the first day."
      : `${headcount} ${headcount === 1 ? "person" : "people"}, with a supervisor on site.`;
  }
  if (helpers === null || helpers <= 0) return crewName;
  return `${crewName} and ${helpers} ${helpers === 1 ? "helper" : "helpers"}`;
}

/**
 * One shift-day.
 *
 * `scheduled_on` is a calendar date and is rendered as one. The design shows a
 * start time beside it — the crew's frozen terms carry a shift *length* but no
 * start time, and nothing on this path ever asked the Customer for one, so
 * printing "9:00 am" would be this screen inventing an arrival the supervisor
 * never agreed to.
 */
function DayCard({
  day,
  headcount,
  standardDayHours,
}: {
  day: StageView;
  headcount: number | null;
  standardDayHours: number | null;
}) {
  return (
    <li className={cn("rounded-card border border-line bg-surface p-4")}>
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-text-muted">
        {day.label}
      </p>
      <p className="mt-1 text-[0.9375rem] font-bold text-text">
        {formatDay(day.scheduledOn) ?? "Date to be confirmed"}
      </p>
      {headcount !== null ? (
        <p className="mt-0.5 text-sm text-text-secondary">
          {headcount} {headcount === 1 ? "person" : "people"}
          {standardDayHours === null ? "" : `, ${standardDayHours}-hour shift`}
        </p>
      ) : null}

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
        <span className="text-sm text-text-secondary">Cash at day end</span>
        <span data-numeric className="text-lg font-bold tabular-nums text-text">
          {day.amountLabel}
        </span>
      </div>
    </li>
  );
}

function formatDay(iso: string | null): string | null {
  if (iso === null) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}
