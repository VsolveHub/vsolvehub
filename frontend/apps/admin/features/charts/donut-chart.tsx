"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { CHART_COLORS } from "./theme";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  title: string;
  subtitle?: string;
  slices: readonly DonutSlice[];
  /** Text under the centre total, e.g. "bookings". */
  totalLabel: string;
}

/**
 * Parts of a whole, for two to four parts only. More parts than that are a bar list.
 *
 * The legend prints each count and share, so a slice is never identified by
 * colour alone.
 */
export function DonutChart({ title, subtitle, slices, totalLabel }: DonutChartProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const share = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
  const summary = `${title}. ${slices
    .map((slice) => `${slice.label}: ${slice.value.toLocaleString("en-IN")} (${share(slice.value)}%)`)
    .join(", ")}.`;

  return (
    <section className="bg-surface border border-line rounded-card p-5 shadow-card">
      <h2 className="text-base font-bold text-text">{title}</h2>
      {subtitle ? <p className="text-xs text-text-secondary">{subtitle}</p> : null}

      {total === 0 ? (
        <p className="mt-4 rounded-control bg-surface-sunken p-6 text-center text-sm text-text-secondary">
          Nothing in this period yet.
        </p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative size-44 shrink-0" role="img" aria-label={summary}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices.filter((slice) => slice.value > 0).map((slice) => ({ ...slice }))}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="68%"
                  outerRadius="100%"
                  paddingAngle={1}
                  stroke={CHART_COLORS.surface}
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices
                    .filter((slice) => slice.value > 0)
                    .map((slice) => (
                      <Cell key={slice.key} fill={slice.color} />
                    ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-text">{total.toLocaleString("en-IN")}</span>
              <span className="text-xs text-text-secondary">{totalLabel}</span>
            </div>
          </div>
          <ul className="w-full space-y-2 text-sm">
            {slices.map((slice) => (
              <li key={slice.key} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block size-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="text-text">{slice.label}</span>
                <span className="ml-auto font-semibold text-text">
                  {slice.value.toLocaleString("en-IN")}
                </span>
                <span className="w-10 text-right text-xs text-text-secondary">
                  {share(slice.value)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
