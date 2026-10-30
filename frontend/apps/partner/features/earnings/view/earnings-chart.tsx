"use client";

import { formatMoney, useT } from "@vsolve/ui";

import type { PartnerPerformance } from "../queries";

type ServerDailyPerformance = PartnerPerformance["daily"][number];

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
 * Every rupee comes from the server's `net_paise`, already bucketed per day by
 * `/partner/performance/`. Nothing here computes or groups an amount.
 */

export interface DailyEarning {
  /** Local `YYYY-MM-DD`, used as the identity of a column. */
  date: string;
  label: string;
  netPaise: number;
}

/**
 * Adapts the server's daily series into columns.
 *
 * Labelling only — no grouping and no arithmetic. The series arrives already
 * bucketed by `/partner/performance/`, one row per local day including the empty
 * ones, over the same seven days this chart draws.
 *
 * This used to group the ledger here instead, and that was wrong in a way that
 * looked right: the client holds one page of the ledger, so the moment a Partner
 * had more entries than fit in a page the chart silently dropped the rest and
 * drew a quieter week than they actually worked. A revenue chart that
 * under-reports is worse than no chart, because nobody can tell.
 *
 * The date is parsed as local noon rather than midnight. A `YYYY-MM-DD` parsed
 * as midnight UTC lands on the previous evening west of Greenwich, which would
 * label every column with the wrong weekday.
 */
export function toDailyEarnings(daily: readonly ServerDailyPerformance[]): DailyEarning[] {
  return daily.map((row) => ({
    date: row.date,
    label: new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }),
    netPaise: row.net_paise,
  }));
}

export function EarningsChart({ days }: { days: readonly DailyEarning[] }) {
  const t = useT();
  const peak = Math.max(...days.map((day) => day.netPaise), 0);
  const total = days.reduce((sum, day) => sum + day.netPaise, 0);

  if (total === 0) {
    return (
      <p className="rounded-card border border-line bg-surface-sunken p-4 text-sm text-text-secondary">
        {t("money.chart.empty")}
      </p>
    );
  }

  return (
    <figure className="m-0">
      <figcaption className="text-sm text-text-secondary">
        {t("money.chart.caption", { amount: formatMoney(total) })}
      </figcaption>

      <div className="mt-4 flex items-end gap-2" role="list" aria-label={t("money.chart.ariaLabel")}>
        {days.map((day) => {
          // A zero day still gets a visible sliver so the column reads as
          // "nothing here" rather than as missing data.
          const heightPercent = peak === 0 ? 0 : (day.netPaise / peak) * 100;
          const isPeak = day.netPaise === peak && peak > 0;

          return (
            <div
              key={day.date}
              role="listitem"
              aria-label={
                day.netPaise === 0
                  ? t("money.chart.bar.nothing", { label: day.label })
                  : t("money.chart.bar.amount", { label: day.label, amount: formatMoney(day.netPaise) })
              }
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
