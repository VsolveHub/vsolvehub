"use client";

import { formatMoney } from "@vsolve/ui";

import type { LedgerEntry } from "../queries";

/**
 * What this Partner earned, day by day.
 *
 * ## Why a bar chart, and only one series
 *
 * The question is "am I earning more or less than before", which is magnitude
 * over time — bars. There is exactly one measure, so there is one hue and no
 * legend: a legend box for a single series is furniture that explains nothing.
 * A second y-axis is never added here; if another measure is ever wanted it gets
 * its own chart.
 *
 * ## Why it is readable without reading
 *
 * The intended reader may not read comfortably. So the shape carries the
 * meaning: taller bar, better day. The biggest day is labelled with its amount
 * and every bar states its own value to a screen reader, but the chart does not
 * put a number on every column — that turns a shape you can scan into a table
 * you have to read.
 *
 * ## Why it is hand-drawn SVG
 *
 * The whole chart is seven rectangles. A charting library would be a dependency,
 * a bundle, and a theme to fight, for geometry that is four lines of arithmetic.
 *
 * Every rupee comes from the server's `net_paise`. Nothing here computes an
 * amount; it only groups entries by the day the server stamped them.
 */

const DAYS_SHOWN = 7;

export interface DailyEarning {
  /** Local `YYYY-MM-DD`, used as the identity of a column. */
  date: string;
  label: string;
  netPaise: number;
}

/**
 * Groups ledger entries into the last `DAYS_SHOWN` local days.
 *
 * Days with nothing in them are kept as zero rather than dropped: a gap that
 * closes up would make an empty Tuesday look like it never happened, and "I did
 * not work Tuesday" is exactly what the reader is looking for.
 */
export function toDailyEarnings(entries: readonly LedgerEntry[]): DailyEarning[] {
  const byDay = new Map<string, number>();
  for (const entry of entries) {
    const day = localDay(new Date(entry.created_at));
    byDay.set(day, (byDay.get(day) ?? 0) + entry.net_paise);
  }

  const today = new Date();
  const days: DailyEarning[] = [];
  for (let offset = DAYS_SHOWN - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = localDay(date);
    days.push({
      date: key,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      netPaise: byDay.get(key) ?? 0,
    });
  }
  return days;
}

function localDay(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function EarningsChart({ days }: { days: readonly DailyEarning[] }) {
  const peak = Math.max(...days.map((day) => day.netPaise), 0);
  const total = days.reduce((sum, day) => sum + day.netPaise, 0);

  if (total === 0) {
    return (
      <p className="rounded-card border border-line bg-surface-sunken p-4 text-sm text-text-secondary">
        No earnings in the last 7 days yet. Finished jobs show up here.
      </p>
    );
  }

  return (
    <figure className="m-0">
      <figcaption className="text-sm text-text-secondary">
        Last 7 days ·{" "}
        <span data-numeric className="font-semibold text-text">
          {formatMoney(total)}
        </span>{" "}
        earned
      </figcaption>

      <div className="mt-4 flex items-end gap-2" role="list" aria-label="Earnings by day">
        {days.map((day) => {
          // A zero day still gets a visible sliver so the column reads as
          // "nothing here" rather than as missing data.
          const heightPercent = peak === 0 ? 0 : (day.netPaise / peak) * 100;
          const isPeak = day.netPaise === peak && peak > 0;

          return (
            <div
              key={day.date}
              role="listitem"
              aria-label={`${day.label}: ${day.netPaise === 0 ? "nothing" : formatMoney(day.netPaise)}`}
              className="flex flex-1 flex-col items-center gap-2"
            >
              {/* Only the best day carries a number. A value on every column
                  turns a shape you can scan into a table you have to read. */}
              <span
                aria-hidden
                data-numeric
                className={`text-xs font-semibold ${isPeak ? "text-text" : "text-transparent"}`}
              >
                {formatMoney(day.netPaise)}
              </span>

              <div
                aria-hidden
                className="flex h-28 w-full items-end justify-center rounded-t bg-surface-sunken"
              >
                <div
                  className="w-full rounded-t bg-brand-500"
                  style={{ height: `${Math.max(heightPercent, day.netPaise > 0 ? 6 : 2)}%` }}
                />
              </div>

              <span aria-hidden className="text-xs text-text-secondary">
                {day.label}
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
