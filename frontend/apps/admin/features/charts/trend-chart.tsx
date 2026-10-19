"use client";

import { formatMoney } from "@vsolve/ui";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { bucketLabel, CHART_COLORS, compactRupees, type Granularity } from "./theme";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

export interface TrendPoint {
  date: string;
  [metric: string]: number | string;
}

interface TrendChartProps {
  title: string;
  /** Says what one point is, e.g. "Per day, last 30 days". */
  subtitle: string;
  data: readonly TrendPoint[];
  series: readonly TrendSeries[];
  granularity: Granularity;
  /** Values are paise and print as ₹. Every series on one chart shares the unit — one axis only. */
  money?: boolean;
  /** Bars for counts, an area for amounts. */
  variant: "area" | "bar";
}

/**
 * One measure (or two of the same unit) over time.
 *
 * Two measures of different units never share a chart: GMV and booking counts
 * are two charts side by side rather than a dual axis.
 */
export function TrendChart({
  title,
  subtitle,
  data,
  series,
  granularity,
  money = false,
  variant,
}: TrendChartProps) {
  const format = (value: number) =>
    money ? formatMoney(value, { showPaise: false }) : value.toLocaleString("en-IN");
  const totals = series.map((entry) => ({
    ...entry,
    total: data.reduce((sum, point) => sum + Number(point[entry.key] ?? 0), 0),
  }));
  const empty = totals.every((entry) => entry.total === 0);
  const summary = `${title}. ${subtitle}. ${totals
    .map((entry) => `${entry.label}: ${format(entry.total)} in total`)
    .join(". ")}.`;

  const axes = (
    <>
      <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
      <XAxis
        dataKey="date"
        tickFormatter={(value: string) => bucketLabel(value, granularity)}
        tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
        tickLine={false}
        axisLine={{ stroke: CHART_COLORS.grid }}
        minTickGap={24}
      />
      <YAxis
        allowDecimals={false}
        tickFormatter={(value: number) =>
          money ? compactRupees(value) : value.toLocaleString("en-IN")
        }
        tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        width={money ? 56 : 40}
      />
      <Tooltip
        cursor={variant === "bar" ? { fill: CHART_COLORS.grid, opacity: 0.5 } : { stroke: CHART_COLORS.axis }}
        content={(props: TooltipContentProps<number, string>) => (
          <TrendTooltip {...props} granularity={granularity} series={series} format={format} />
        )}
      />
    </>
  );

  return (
    <section className="bg-surface border border-line rounded-card p-5 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-text">{title}</h2>
          <p className="text-xs text-text-secondary">{subtitle}</p>
        </div>
        <dl className="flex flex-wrap gap-4">
          {totals.map((entry) => (
            <div key={entry.key}>
              <dt className="flex items-center gap-1.5 text-xs text-text-secondary">
                {series.length > 1 ? (
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-sm"
                    style={{ backgroundColor: entry.color }}
                  />
                ) : null}
                {entry.label}
              </dt>
              <dd className="text-lg font-bold text-text">{format(entry.total)}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="mt-4 h-56" role="img" aria-label={summary}>
        {empty ? (
          <div className="flex h-full items-center justify-center rounded-control bg-surface-sunken text-sm text-text-secondary">
            Nothing in this period yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {variant === "bar" ? (
              <BarChart data={[...data]} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
                {axes}
                {series.map((entry) => (
                  <Bar
                    key={entry.key}
                    dataKey={entry.key}
                    name={entry.label}
                    fill={entry.color}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            ) : (
              <AreaChart data={[...data]} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                {axes}
                {series.map((entry) => (
                  <Area
                    key={entry.key}
                    type="monotone"
                    dataKey={entry.key}
                    name={entry.label}
                    stroke={entry.color}
                    strokeWidth={2}
                    fill={entry.color}
                    fillOpacity={0.12}
                    dot={false}
                    activeDot={{ r: 4, stroke: CHART_COLORS.surface, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
  granularity,
  series,
  format,
}: TooltipContentProps<number, string> & {
  granularity: Granularity;
  series: readonly TrendSeries[];
  format: (value: number) => string;
}) {
  if (!active || !payload?.length || typeof label !== "string") return null;
  return (
    <div className="rounded-control border border-line bg-surface px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-text">{bucketLabel(label, granularity, true)}</p>
      <ul className="mt-1 space-y-0.5">
        {series.map((entry) => {
          const point = payload.find((item) => item.dataKey === entry.key);
          return (
            <li key={entry.key} className="flex items-center gap-1.5 text-text-secondary">
              <span
                aria-hidden
                className="inline-block size-2 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              {entry.label}
              <span className="ml-auto pl-3 font-semibold text-text">
                {format(Number(point?.value ?? 0))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
