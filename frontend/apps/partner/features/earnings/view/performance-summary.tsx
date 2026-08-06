"use client";

import { describeError } from "@vsolve/query";
import { Card, ErrorState, Skeleton, formatMoney } from "@vsolve/ui";
import { Briefcase, CalendarRange, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

import { usePartnerPerformance } from "../queries";
import { EarningsChart } from "./earnings-chart";

/**
 * How the Partner is doing, on the home screen.
 *
 * ## Today is the headline
 *
 * A Partner opening the app mid-shift is asking one question — "how am I doing
 * today?" — so today's money is the hero number and today's job count sits
 * beside it. Month and average are context underneath, not equal tiles: four
 * numbers of the same size make the reader compare before they can read.
 *
 * ## Every figure is the server's
 *
 * Nothing is summed here. The counts are `EARNING` ledger entries — one per
 * completed booking — and the trend is computed server-side because the browser
 * only ever holds one page of the ledger. A chart that grouped a paginated list
 * would quietly under-report the busiest Partners.
 *
 * ## Zero is a real answer
 *
 * A Partner who has not worked today sees ₹0 and "no jobs yet", not an empty
 * space. Hiding the number would leave them wondering whether the screen had
 * failed to load.
 */
export function PerformanceSummary() {
  const performance = usePartnerPerformance();

  if (performance.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (performance.isError) {
    return (
      <ErrorState
        title="We could not load your numbers"
        message={describeError(performance.error, "read").message}
        actionLabel="Try again"
        onAction={() => void performance.refetch()}
      />
    );
  }

  const data = performance.data;

  return (
    <section aria-labelledby="performance-heading" className="flex flex-col gap-3">
      <h2 id="performance-heading" className="sr-only">
        How you are doing
      </h2>

      <Card className="p-5">
        <p className="text-sm font-semibold text-text-secondary">You earned today</p>
        <p data-numeric className="mt-1 text-4xl font-bold leading-tight text-text">
          {formatMoney(data.today_net_paise)}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-text-secondary">
          <Briefcase aria-hidden className="size-4" />
          {data.today_jobs === 0
            ? "No jobs finished yet today"
            : `${data.today_jobs} ${data.today_jobs === 1 ? "job" : "jobs"} finished`}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Metric
          icon={<CalendarRange aria-hidden className="size-4" />}
          label="This month"
          value={formatMoney(data.month_net_paise)}
          note={`${data.month_jobs} ${data.month_jobs === 1 ? "job" : "jobs"}`}
        />
        <Metric
          icon={<TrendingUp aria-hidden className="size-4" />}
          label="Usual month"
          value={formatMoney(data.average_monthly_net_paise)}
          note={`${data.lifetime_jobs} jobs all time`}
        />
      </div>

      <Card className="p-5">
        <h3 className="text-base font-bold text-text">Your last 7 days</h3>
        <div className="mt-3">
          <EarningsChart
            days={data.daily.map((day) => ({
              date: day.date,
              label: new Date(day.date).toLocaleDateString(undefined, { weekday: "short" }),
              netPaise: day.net_paise,
            }))}
          />
        </div>
      </Card>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted">
        {icon}
        {label}
      </p>
      <p data-numeric className="mt-1 text-xl font-bold text-text">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-text-secondary">{note}</p>
    </Card>
  );
}
