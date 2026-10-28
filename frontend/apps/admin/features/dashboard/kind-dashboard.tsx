"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorState, formatMoney, Spinner } from "@vsolve/ui";

import { BarList, type BarListRow } from "@/features/charts/bar-list";
import { DonutChart } from "@/features/charts/donut-chart";
import { CHART_COLORS, STATUS_COLORS, statusLabel, type Granularity } from "@/features/charts/theme";
import { TrendChart, type TrendPoint } from "@/features/charts/trend-chart";

import { DASHBOARD_TABS } from "./dashboard-tabs";
import { useDashboardAggregates } from "./queries";

export function humanize(key: string): string {
  const noPaise = key.replace(/_paise$/, "");
  return noPaise
    .split("_")
    .map(w => {
       if (w.toLowerCase() === 'gmv') return 'GMV';
       if (w.toLowerCase() === 'kyc') return 'KYC';
       if (w.toLowerCase() === 'sla') return 'SLA';
       return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Explicit metric-key → Ops console (checked before heuristic matching). */
export const METRIC_KEY_HREF: Record<string, string> = {
  // Cases & disputes
  open_cases: "/operations/cases",
  cases_open: "/operations/cases",
  disputed_bookings: "/operations/cases",
  cases: "/operations/cases",
  case: "/operations/cases",
  breaching_sla: "/operations/cases",
  mine_open: "/operations/cases",
  unclaimed_cases: "/operations/cases",
  holding_payout: "/operations/cases",
  active_cases: "/operations/cases",
  total_cases: "/operations/cases",

  // Bookings & requests
  overdue_bookings: "/operations/requests",
  cancelled_bookings: "/operations/requests",
  bookings: "/operations/requests",
  booking: "/operations/requests",
  requests: "/operations/requests",
  request: "/operations/requests",
  status_breakdown: "/operations/requests",

  // Reports & financial summaries
  reports: "/operations/reports",
  report: "/operations/reports",
  ops_reports: "/operations/reports",
  business_reports: "/operations/reports",
  completed_bookings: "/operations/reports",
  collected_gmv_paise: "/operations/reports",
  collected_gmv: "/operations/reports",
  gmv_paise: "/operations/reports",
  gmv: "/operations/reports",
  revenue_paise: "/operations/reports",
  revenue: "/operations/reports",
  overview: "/operations/reports",
  business: "/operations/reports",

  // Rentals
  active_rentals: "/operations/rentals",
  rental_bookings: "/operations/rentals",
  rentals: "/operations/rentals",
  rental: "/operations/rentals",
  equipment_rentals: "/operations/rentals",
  "equipment rentals": "/operations/rentals",
  rental_revenue: "/operations/rentals",
  rental_revenue_paise: "/operations/rentals",
  rentals_active: "/operations/rentals",
  total_rentals: "/operations/rentals",

  // Stays
  active_stays: "/operations/stays",
  stay_bookings: "/operations/stays",
  properties: "/operations/stays",
  property: "/operations/stays",
  stays: "/operations/stays",
  stay: "/operations/stays",
  stay_reservations: "/operations/stays",
  stay_enquiries: "/operations/stays",
  rooms_pg_hotels: "/operations/stays",
  "rooms / pg / hotels": "/operations/stays",
  "rooms/pg/hotels": "/operations/stays",
  stay_revenue: "/operations/stays",
  stay_revenue_paise: "/operations/stays",
  stays_active: "/operations/stays",
  total_stays: "/operations/stays",

  // Partners & KYC
  active_partners: "/operations/partners",
  pending_kyc: "/operations/partners",
  kyc_pending: "/operations/partners",
  partners_pending: "/operations/partners",
  pending_partners: "/operations/partners",
  partner_review_stats: "/operations/partners",
  partner_applications: "/operations/partners",
  approved_partners: "/operations/partners",
  partners_active: "/operations/partners",
  total_partners: "/operations/partners",
  partners: "/operations/partners",
  partner: "/operations/partners",
  vendors: "/operations/partners",
  vendor: "/operations/partners",
  active_vendors: "/operations/partners",

  // Subscriptions & vendor plans
  active_subscriptions: "/operations/vendor-plans",
  subscriptions: "/operations/vendor-plans",
  vendor_plans: "/operations/vendor-plans",

  // Listings & moderation
  live_listings: "/operations/listings",
  pending_listings: "/operations/listings",
  listings: "/operations/listings",
  listing: "/operations/listings",
  categories: "/operations/listings",

  // Payouts & settlements
  payout_ready: "/operations/payouts",
  pending_payouts: "/operations/payouts",
  payouts_ready: "/operations/payouts",
  payouts_pending: "/operations/payouts",
  payouts: "/operations/payouts",
  payout: "/operations/payouts",
  partner_payouts: "/operations/payouts",
  completed_payouts: "/operations/payouts",
  total_payouts: "/operations/payouts",
  payout_holds: "/operations/payouts",
  payout_batches: "/operations/payouts",
  settlements: "/operations/payouts",
  settlement: "/operations/payouts",

  // Finance & refunds
  refunds_paise: "/finance",
  refunds: "/finance",
  refund: "/finance",

  // Loyalty & Wallets
  wallet_liability_paise: "/operations/loyalty",
  wallet_liability: "/operations/loyalty",
  new_signups: "/operations/loyalty",
  active_wallets: "/operations/loyalty",
  coin_burns: "/operations/loyalty",
  referral_attributions: "/operations/loyalty",
  loyalty: "/operations/loyalty",
  wallets: "/operations/loyalty",
  wallet: "/operations/loyalty",

  // Kill switches
  kill_switches_active: "/operations/kill-switches",
  kill_switches: "/operations/kill-switches",
};

/** Map aggregate keys / dashboard kinds to existing Ops consoles. */
export function hrefForMetric(kind: string, key: string): string | null {
  const normalizedKey = key.trim().toLowerCase();
  const exact = METRIC_KEY_HREF[key] ?? METRIC_KEY_HREF[normalizedKey];
  if (exact) return exact;

  const k = `${kind}:${normalizedKey}`;
  if (k.includes("case") || k.includes("dispute") || k.includes("sla")) return "/operations/cases";
  if (k.includes("rental") || k.includes("equipment")) return "/operations/rentals";
  if (k.includes("stay") || k.includes("property") || k.includes("room") || k.includes("hotel") || k.includes("pg")) return "/operations/stays";
  if (k.includes("listing") || k.includes("job")) return "/operations/listings";
  if (k.includes("payout") || k.includes("settlement")) return "/operations/payouts";
  if (k.includes("partner") || k.includes("vendor") || k.includes("kyc")) return "/operations/partners";
  if (k.includes("wallet") || k.includes("loyalty") || k.includes("coin") || k.includes("signup") || k.includes("referral")) return "/operations/loyalty";
  if (k.includes("refund")) return "/finance";
  if (k.includes("report") || k.includes("gmv") || k.includes("revenue")) return "/operations/reports";
  if (k.includes("booking") || k.includes("request")) return "/operations/requests";
  if (kind === "overview" || kind === "business") return "/operations/reports";
  if (kind === "categories") return "/operations/listings";
  if (kind === "customer") return "/operations/loyalty";
  if (kind === "vendor" || kind === "partner" || kind === "partners") return "/operations/partners";
  if (kind === "booking" || kind === "bookings") return "/operations/requests";
  if (kind === "case" || kind === "cases") return "/operations/cases";
  if (kind === "rental" || kind === "rentals") return "/operations/rentals";
  if (kind === "stay" || kind === "stays") return "/operations/stays";
  if (kind === "payout" || kind === "payouts") return "/operations/payouts";
  if (kind === "report" || kind === "reports") return "/operations/reports";
  return null;
}

/** Keys the trend charts read; they are not tiles. */
const SERIES_KEYS = new Set(["series", "series_granularity"]);

/** Partner applications move through these in order, so the bars keep it. */
const APPLICATION_PIPELINE = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUIRED",
  "APPROVED",
  "SUSPENDED",
  "OFFBOARDED",
];

function seriesSubtitle(granularity: Granularity, dateStart: string, dateEnd: string): string {
  const unit = granularity === "week" ? "Per week" : "Per day";
  if (!dateStart && !dateEnd) return `${unit}, last 30 days`;
  return `${unit}, selected range`;
}

function TrendCharts({
  kind,
  data,
  dateStart,
  dateEnd,
}: {
  kind: string;
  data: Record<string, unknown>;
  dateStart: string;
  dateEnd: string;
}) {
  const series = Array.isArray(data.series) ? (data.series as TrendPoint[]) : null;
  if (!series) return null;
  const granularity: Granularity = data.series_granularity === "week" ? "week" : "day";
  const subtitle = seriesSubtitle(granularity, dateStart, dateEnd);

  if (kind === "overview" || kind === "business") {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TrendChart
          title="Money collected"
          subtitle={subtitle}
          data={series}
          granularity={granularity}
          money
          variant="area"
          series={[
            { key: "collected_gmv_paise", label: "Collected GMV", color: CHART_COLORS.primary },
            { key: "refunds_paise", label: "Refunded", color: CHART_COLORS.secondary },
          ]}
        />
        <TrendChart
          title="Completed bookings"
          subtitle={subtitle}
          data={series}
          granularity={granularity}
          variant="bar"
          series={[{ key: "completed_bookings", label: "Completed", color: CHART_COLORS.primary }]}
        />
      </div>
    );
  }
  if (kind === "customer") {
    return (
      <TrendChart
        title="New signups"
        subtitle={subtitle}
        data={series}
        granularity={granularity}
        variant="bar"
        series={[{ key: "new_signups", label: "Signups", color: CHART_COLORS.primary }]}
      />
    );
  }
  return null;
}

/** Booking outcomes in four groups — few enough for a donut. */
function BookingOutcomes({ breakdown }: { breakdown: Record<string, unknown> }) {
  const count = (...codes: string[]) =>
    codes.reduce((sum, code) => sum + (typeof breakdown[code] === "number" ? (breakdown[code] as number) : 0), 0);
  const total = Object.values(breakdown).reduce<number>(
    (sum, value) => sum + (typeof value === "number" ? value : 0),
    0,
  );
  const completed = count("COMPLETED", "PARTIALLY_COMPLETED");
  const cancelled = count("CANCELLED", "ABORTED");
  const attention = count("DISPUTED", "RECOVERY_REQUIRED");
  return (
    <DonutChart
      title="How bookings ended up"
      subtitle="Bookings created in this period, by where they are now."
      totalLabel="bookings"
      slices={[
        { key: "completed", label: "Completed", value: completed, color: STATUS_COLORS.good },
        {
          key: "open",
          label: "Still in progress",
          value: total - completed - cancelled - attention,
          color: STATUS_COLORS.neutral,
        },
        { key: "attention", label: "Disputed or in recovery", value: attention, color: STATUS_COLORS.warning },
        { key: "cancelled", label: "Cancelled or aborted", value: cancelled, color: STATUS_COLORS.bad },
      ]}
    />
  );
}

function breakdownRows(kind: string, key: string, table: Record<string, unknown>): BarListRow[] {
  return Object.entries(table).map(([name, raw]) => {
    const href = hrefForMetric(kind, name) ?? hrefForMetric(kind, key);
    if (typeof raw === "object" && raw !== null) {
      const metrics = raw as Record<string, unknown>;
      const revenue = typeof metrics.revenue_paise === "number" ? metrics.revenue_paise : 0;
      const bookings = typeof metrics.bookings === "number" ? metrics.bookings : null;
      return {
        key: name,
        label: name,
        value: revenue,
        display: formatMoney(revenue, { showPaise: false }),
        detail: bookings === null ? undefined : `${bookings.toLocaleString("en-IN")} booking${bookings === 1 ? "" : "s"}`,
        href,
      };
    }
    return {
      key: name,
      label: statusLabel(name),
      value: typeof raw === "number" ? raw : 0,
      href,
    };
  });
}

function BreakdownCard({ kind, metricKey, table }: { kind: string; metricKey: string; table: Record<string, unknown> }) {
  const rowKeys = Object.keys(table);
  const firstRowKey = rowKeys[0];
  const firstRow = firstRowKey !== undefined ? table[firstRowKey] : null;
  const isObjectOfObjects = firstRow !== null && typeof firstRow === "object";
  const metricKeys = isObjectOfObjects ? Object.keys(firstRow as Record<string, unknown>) : ["Count"];
  const pipeline = metricKey === "partner_review_stats";
  const rows = breakdownRows(kind, metricKey, table);
  const ordered = pipeline
    ? [...rows].sort((a, b) => {
        const rank = (row: BarListRow) => {
          const index = APPLICATION_PIPELINE.indexOf(row.key);
          return index === -1 ? APPLICATION_PIPELINE.length : index;
        };
        return rank(a) - rank(b);
      })
    : rows;
  const href = hrefForMetric(kind, metricKey);
  const title =
    metricKey === "categories"
      ? "Revenue by category"
      : metricKey === "status_breakdown"
        ? "Bookings by status"
        : metricKey === "partner_review_stats"
          ? "Partner applications by stage"
          : humanize(metricKey);

  return (
    <section className="col-span-1 md:col-span-3 bg-surface border border-line rounded-card shadow-card">
      <div className="p-5 border-b border-line flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-text">{title}</h2>
        {href ? (
          <Link href={href} className="text-xs font-semibold text-action hover:underline">
            Open related
          </Link>
        ) : null}
      </div>
      <div className="p-5">
        <BarList rows={ordered} sort={!pipeline} emptyText="No data available" />
      </div>
      {rowKeys.length > 0 ? (
        <details className="border-t border-line">
          <summary className="cursor-pointer px-5 py-3 text-xs font-semibold text-text-secondary hover:text-text">
            View as table
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-y border-line bg-surface-sunken/60 text-text-secondary uppercase tracking-wider text-xs font-semibold">
                  <th className="py-3 px-5 font-semibold">Name</th>
                  {metricKeys.map((m) => (
                    <th key={m} className="py-3 px-5 font-semibold text-right">
                      {m === "revenue_paise" ? "Revenue" : humanize(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {Object.entries(table).map(([rowName, rawMetrics]) => {
                  const metricsObj =
                    typeof rawMetrics === "object" && rawMetrics !== null
                      ? (rawMetrics as Record<string, unknown>)
                      : null;
                  return (
                    <tr key={rowName}>
                      <td className="py-3 px-5 font-medium text-text">
                        {isObjectOfObjects ? rowName : statusLabel(rowName)}
                      </td>
                      {isObjectOfObjects && metricsObj ? (
                        metricKeys.map((m) => {
                          const metricVal = metricsObj[m];
                          return (
                            <td key={m} className="py-3 px-5 text-text text-right">
                              {m.includes("paise") && typeof metricVal === "number"
                                ? formatMoney(metricVal, { showPaise: true })
                                : metricVal != null
                                  ? String(metricVal)
                                  : "—"}
                            </td>
                          );
                        })
                      ) : (
                        <td className="py-3 px-5 text-text text-right">
                          {typeof rawMetrics === "number"
                            ? rawMetrics.toLocaleString("en-IN")
                            : String(rawMetrics ?? "—")}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}

function MetricTile({ kind, metricKey, value }: { kind: string; metricKey: string; value: unknown }) {
  const href = hrefForMetric(kind, metricKey);
  const tile = (
    <>
      <span className="text-xs font-bold text-text-secondary tracking-wider uppercase">
        {humanize(metricKey)}
      </span>
      <div className="mt-1.5 flex items-baseline">
        <span className="text-3xl font-bold text-text">
          {metricKey.includes("paise") && typeof value === "number"
            ? formatMoney(value, { showPaise: true })
            : typeof value === "number"
              ? value.toLocaleString("en-IN")
              : String(value)}
        </span>
      </div>
      {href ? <span className="mt-2 text-xs font-medium text-action">View related →</span> : null}
    </>
  );
  const className =
    "bg-surface border border-line rounded-card p-4 border-l-4 border-l-line shadow-card flex flex-col justify-center transition-colors hover:bg-surface-hover/40";
  return href ? (
    <Link href={href} className={className}>
      {tile}
    </Link>
  ) : (
    <div className={className}>{tile}</div>
  );
}

export function DashboardView({ kind }: { kind: string }) {
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const { data, isLoading, isError, refetch } = useDashboardAggregates(kind, dateStart, dateEnd);
  const entries = data ? Object.entries(data).filter(([key]) => !SERIES_KEYS.has(key)) : [];
  const tiles = entries.filter(([, value]) => typeof value !== "object" || value === null);
  const breakdowns = entries.filter(
    ([, value]) => typeof value === "object" && value !== null && !Array.isArray(value),
  ) as [string, Record<string, unknown>][];
  const statusBreakdown =
    kind === "booking" && typeof data?.status_breakdown === "object" && data.status_breakdown !== null
      ? (data.status_breakdown as Record<string, unknown>)
      : null;

  return (
    <div className="flex flex-col h-full bg-surface gap-6">
      <header className="flex-none py-6 pb-4 sm:px-6 border-b border-line flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-text">
          {/* The tab's own name, so "vendor" reads as Partners like the tab above it. */}
          {DASHBOARD_TABS.find((tab) => tab.href.endsWith(`/${kind}`))?.label ?? humanize(kind)} dashboard
        </h1>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="flex flex-col">
            <label htmlFor="dashboard-from" className="text-xs font-semibold text-text-muted mb-0.5">From</label>
            <input
              id="dashboard-from"
              type="date"
              className="min-h-10 bg-surface border border-line rounded-md px-3 py-1.5 text-sm text-text"
              value={dateStart}
              max={dateEnd || undefined}
              onChange={(e) => setDateStart(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label htmlFor="dashboard-to" className="text-xs font-semibold text-text-muted mb-0.5">To</label>
            <input
              id="dashboard-to"
              type="date"
              className="min-h-10 bg-surface border border-line rounded-md px-3 py-1.5 text-sm text-text"
              value={dateEnd}
              min={dateStart || undefined}
              onChange={(e) => setDateEnd(e.target.value)}
            />
          </div>
          {dateStart || dateEnd ? (
            <button
              type="button"
              onClick={() => {
                setDateStart("");
                setDateEnd("");
              }}
              className="min-h-10 px-2 text-sm font-medium text-action hover:underline"
            >
              Clear dates
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-6 sm:px-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-text-muted" role="status">
            <Spinner size="sm" />
            Loading this dashboard…
          </div>
        ) : isError ? (
          <ErrorState
            title="We could not load this dashboard"
            message="Nothing has changed. Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void refetch()}
          />
        ) : data ? (
          <div className="flex flex-col gap-6">
            {tiles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {tiles.map(([key, value]) => (
                  <MetricTile key={key} kind={kind} metricKey={key} value={value} />
                ))}
              </div>
            ) : null}
            <TrendCharts kind={kind} data={data} dateStart={dateStart} dateEnd={dateEnd} />
            {statusBreakdown ? <BookingOutcomes breakdown={statusBreakdown} /> : null}
            {breakdowns.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {breakdowns.map(([key, table]) => (
                  <BreakdownCard key={key} kind={kind} metricKey={key} table={table} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
