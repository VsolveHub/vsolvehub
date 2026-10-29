"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { describeError, useBrowseList } from "@vsolve/query";
import { ErrorState, LoadMore, Skeleton, formatDate, formatMoney, segmentStyles } from "@vsolve/ui";

import {
  PERIOD_LABELS,
  fetchMoneyPayments,
  fetchMoneySummary,
  moneySummaryKey,
  type MoneyPeriod,
  type MoneyService,
  type MoneySummary,
} from "./queries";

const PERIODS: MoneyPeriod[] = ["this_month", "last_month", "all"];

/**
 * One service's money: how it earns, the totals for a period, each plan's buyers and revenue,
 * and who paid. Everything comes from the server for this service only.
 */
export function MoneyTab({ service }: { service: MoneyService }) {
  const [period, setPeriod] = useState<MoneyPeriod>("this_month");
  const summary = useQuery({
    queryKey: moneySummaryKey(service, period),
    queryFn: () => fetchMoneySummary(service, period),
  });

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Period" className="flex flex-wrap gap-1">
        {PERIODS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={period === value}
            className={segmentStyles({ selected: period === value })}
            onClick={() => setPeriod(value)}
          >
            {PERIOD_LABELS[value]}
          </button>
        ))}
      </div>

      {summary.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : summary.error ? (
        <ErrorState
          title="Could not load the money summary"
          message={describeError(summary.error).message}
          actionLabel="Try again"
          onAction={() => void summary.refetch()}
        />
      ) : summary.data ? (
        <SummaryView summary={summary.data} />
      ) : null}

      <Payments service={service} period={period} />
    </div>
  );
}

function SummaryView({ summary }: { summary: MoneySummary }) {
  return (
    <>
      <p className="rounded-xl border border-line bg-surface-sunken px-4 py-3 text-sm text-text-secondary">
        <span className="font-semibold text-text">How this earns: </span>
        {summary.model}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="money-totals">
        {summary.totals.map((item) => (
          <div key={item.key} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-xs font-medium text-text-secondary">{item.label}</p>
            <p className="mt-1 text-xl font-bold text-navy-900">
              {item.kind === "money"
                ? formatMoney(item.value)
                : item.kind === "percent"
                  ? `${item.value}%`
                  : item.value.toLocaleString("en-IN")}
            </p>
            {item.note ? <p className="mt-1 text-[11px] text-text-muted">{item.note}</p> : null}
          </div>
        ))}
      </div>

      {summary.plans.length > 0 ? (
        <section className="rounded-xl border border-line bg-surface">
          <h3 className="border-b border-line px-4 py-3 text-sm font-bold text-navy-900">
            Subscription plans
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-medium">Plan</th>
                  <th className="px-4 py-2 font-medium">Price</th>
                  <th className="px-4 py-2 font-medium">Bought</th>
                  <th className="px-4 py-2 font-medium">On it now</th>
                  <th className="px-4 py-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {summary.plans.map((plan) => (
                  <tr key={plan.id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-text">{plan.name}</span>
                      {plan.is_active ? null : (
                        <span className="ml-2 text-xs text-text-muted">(not on sale)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {formatMoney(plan.price_paise)} / {plan.duration_days} days
                    </td>
                    <td className="px-4 py-2.5">{plan.purchases}</td>
                    <td className="px-4 py-2.5">{plan.active_now}</td>
                    <td className="px-4 py-2.5 font-semibold">{formatMoney(plan.revenue_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Payments({ service, period }: { service: MoneyService; period: MoneyPeriod }) {
  const payments = useBrowseList(["ops-money-payments", service, period], (offset, limit) =>
    fetchMoneyPayments(service, period, offset, limit),
  );

  return (
    <section className="rounded-xl border border-line bg-surface">
      <h3 className="border-b border-line px-4 py-3 text-sm font-bold text-navy-900">Who paid</h3>
      {payments.isLoading ? (
        <div className="p-4">
          <Skeleton className="h-20 w-full" />
        </div>
      ) : payments.error ? (
        <div className="p-4">
          <ErrorState
            title="Could not load payments"
            message={describeError(payments.error).message}
            actionLabel="Try again"
            onAction={() => void payments.refetch()}
          />
        </div>
      ) : payments.items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-secondary">No payments in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-text-secondary">
              <tr>
                <th className="px-4 py-2 font-medium">Paid on</th>
                <th className="px-4 py-2 font-medium">Who</th>
                <th className="px-4 py-2 font-medium">For</th>
                <th className="px-4 py-2 font-medium">Charged</th>
                <th className="px-4 py-2 font-medium">Refunded</th>
                <th className="px-4 py-2 font-medium">Platform share</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.items.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="whitespace-nowrap px-4 py-2.5">{formatDate(row.paid_at)}</td>
                  <td className="px-4 py-2.5">
                    <span className="block font-semibold text-text">{row.payer_name || "—"}</span>
                    <span className="block text-xs text-text-muted">{row.payer_phone}</span>
                  </td>
                  <td className="px-4 py-2.5">{row.item}</td>
                  <td className="px-4 py-2.5">{formatMoney(row.amount_paise)}</td>
                  <td className="px-4 py-2.5">
                    {row.refunded_paise ? formatMoney(row.refunded_paise) : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-semibold">{formatMoney(row.platform_paise)}</td>
                  <td className="px-4 py-2.5 text-xs">{row.status.replaceAll("_", " ").toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3">
            <LoadMore
              hasMore={payments.hasMore}
              loading={payments.loadingMore}
              onLoadMore={payments.loadMore}
              label="Show more payments"
            />
          </div>
        </div>
      )}
    </section>
  );
}

/** The server's true listing counts, keyed, for a page's count cards. */
export function useListingCounts(service: MoneyService): Record<string, number> | null {
  const summary = useQuery({
    queryKey: moneySummaryKey(service, "this_month"),
    queryFn: () => fetchMoneySummary(service, "this_month"),
  });
  const rows = summary.data?.listing_counts;
  // Until the server answers (or if it answers oddly), the page falls back to its own counts.
  if (!Array.isArray(rows)) return null;
  return Object.fromEntries(rows.map((row) => [row.key, row.count]));
}
