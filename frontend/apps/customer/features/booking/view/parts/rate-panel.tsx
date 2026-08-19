"use client";

import { Skeleton } from "@vsolve/ui";

/**
 * The published day rate, as the one loud thing on the screen.
 *
 * Navy ground so it carries without needing a typeface larger than the page
 * heading, and it is reserved for the number the screen exists to communicate.
 * One per screen — a second would make neither of them the answer.
 *
 * ## It never renders blank
 *
 * The shipped version drew this panel with an empty rate whenever the preview
 * had not resolved, which reads as "we have no price for you" rather than "we
 * are working it out". There is no state here where the number is absent: either
 * the server sent one, or the panel is a skeleton of the same shape.
 *
 * ## The city is the customer's own answer
 *
 * `RatePreview` publishes no locality — the card is resolved through the
 * requirement's service area server-side and the name never comes back. So the
 * eyebrow takes the city from the address they picked, which is a label on their
 * own input rather than a figure this client invented. Absent, it simply says
 * "Published rate".
 */

export interface RatePanelProps {
  /** The city the card is published for, from the chosen address. */
  city: string | null;
  /** The day rate, server-formatted. */
  dayRateLabel: string;
  /** What counts as a day. */
  standardDayHours: number;
  /** What overtime costs beyond it, server-formatted. */
  overtimeHourlyLabel: string;
}

export function RatePanel({
  city,
  dayRateLabel,
  standardDayHours,
  overtimeHourlyLabel,
}: RatePanelProps) {
  return (
    <div className="rounded-2xl bg-navy-900 p-[18px] text-text-inverse">
      <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-signal-500">
        {city === null ? "Published rate" : `Published rate · ${city}`}
      </p>

      <p className="mt-2.5 flex flex-wrap items-baseline gap-2">
        <span className="text-[42px] font-extrabold leading-[44px] tracking-[-0.03em] tabular-nums">
          {dayRateLabel}
        </span>
        <span className="text-sm font-medium text-warm-300">per person, per day</span>
      </p>

      <p className="mt-3 border-t border-navy-800 pt-3 text-[13px] leading-5 text-warm-300">
        {standardDayHours}-hour shift · overtime {overtimeHourlyLabel} per hour, only if
        you approve it
      </p>
    </div>
  );
}

/** The panel's height, while the rate is being worked out. Never a blank panel. */
export function RatePanelSkeleton() {
  return (
    <div aria-busy="true" className="rounded-2xl bg-navy-900 p-[18px]">
      <span className="sr-only">Working out the published rate</span>
      <Skeleton className="h-3 w-40 bg-navy-800" />
      <Skeleton className="mt-3 h-11 w-48 bg-navy-800" />
      <div className="mt-3 border-t border-navy-800 pt-3">
        <Skeleton className="h-3 w-full bg-navy-800" />
      </div>
    </div>
  );
}
