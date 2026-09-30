"use client";

import Link from "next/link";
import { useState } from "react";
import { useDashboardAggregates } from "./queries";
import { formatMoney } from "@vsolve/ui";

function humanize(key: string): string {
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

export function DashboardView({ kind }: { kind: string }) {
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const { data, isLoading } = useDashboardAggregates(kind, dateStart, dateEnd);

  return (
    <div className="flex flex-col h-full bg-surface gap-6">
      <header className="flex-none p-6 pb-4 border-b border-line flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text capitalize">{kind} Dashboard</h1>
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-text-muted mb-0.5">Start (DD/MM/YYYY)</label>
            <input
              type="date"
              className="bg-surface border border-line rounded-md px-3 py-1.5 text-sm text-text"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
            />
          </div>
          <span className="text-text-muted self-end pb-2.5">to</span>
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-text-muted mb-0.5">End (DD/MM/YYYY)</label>
            <input
              type="date"
              className="bg-surface border border-line rounded-md px-3 py-1.5 text-sm text-text"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="text-text-muted">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {data ? Object.entries(data as Record<string, unknown>).map(([key, value]) => {
              if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                const tableData = value as Record<string, unknown>;
                const rowKeys = Object.keys(tableData);
                const firstRowKey = rowKeys[0] as string | undefined;
                const firstRow = firstRowKey !== undefined ? tableData[firstRowKey] : null;
                const isObjectOfObjects = firstRow !== null && typeof firstRow === "object";
                
                const metricKeys = isObjectOfObjects ? Object.keys(firstRow as Record<string, unknown>) : ["Count"];

                return (
                  <div key={key} className="col-span-1 md:col-span-3 bg-surface border border-line rounded-card overflow-hidden flex flex-col shadow-card">
                    <div className="p-6 border-b border-line bg-surface flex items-center justify-between gap-3">
                      <h2 className="text-base font-bold text-text">
                        {humanize(key)}
                      </h2>
                      {hrefForMetric(kind, key) ? (
                        <Link
                          href={hrefForMetric(kind, key)!}
                          className="text-xs font-semibold text-action hover:underline"
                        >
                          Open related
                        </Link>
                      ) : null}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs sm:text-sm">
                        <thead>
                          <tr className="border-b border-line bg-surface-sunken/60 text-text-secondary uppercase tracking-wider text-xs font-semibold">
                            <th className="py-3 px-6 font-semibold">Name</th>
                            {metricKeys.map((m) => {
                               const title = m === "revenue_paise" ? "Revenue" : humanize(m);
                               return (
                                <th key={m} className="py-3 px-6 font-semibold text-right">
                                  {title}
                                </th>
                               );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {Object.entries(tableData).map(([rowName, rawMetrics]) => {
                            const rowHref =
                              hrefForMetric(kind, rowName) ?? hrefForMetric(kind, key);
                            const metricsObj = typeof rawMetrics === "object" && rawMetrics !== null ? (rawMetrics as Record<string, unknown>) : null;
                            const cells = (
                              <>
                                <td className="py-3.5 px-6 font-medium text-text capitalize">
                                  {rowHref ? (
                                    <Link href={rowHref} className="text-action hover:underline">
                                      {rowName.replace(/_/g, " ").toLowerCase()}
                                    </Link>
                                  ) : (
                                    rowName.replace(/_/g, " ").toLowerCase()
                                  )}
                                </td>
                                {isObjectOfObjects && metricsObj ? metricKeys.map((m) => {
                                  const metricVal = metricsObj[m];
                                  return (
                                    <td key={m} className="py-3.5 px-6 text-text text-right">
                                      {m.includes("paise") && typeof metricVal === "number"
                                        ? formatMoney(metricVal, { showPaise: true })
                                        : (metricVal != null ? String(metricVal) : "—")}
                                    </td>
                                  );
                                }) : (
                                  <td className="py-3.5 px-6 text-text text-right">
                                    {typeof rawMetrics === "number" ? rawMetrics.toLocaleString("en-IN") : String(rawMetrics ?? "—")}
                                  </td>
                                )}
                              </>
                            );
                            return (
                              <tr key={rowName} className="bg-surface hover:bg-surface-hover/50 transition-colors">
                                {cells}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {rowKeys.length === 0 && (
                        <div className="p-6 text-center text-sm text-text-secondary">No data available</div>
                      )}
                    </div>
                  </div>
                );
              }

              const href = hrefForMetric(kind, key);
              const tile = (
                <>
                  <span className="text-xs font-bold text-text-secondary tracking-wider uppercase">
                    {humanize(key)}
                  </span>
                  <div className="mt-1.5 flex items-baseline">
                    <span className="text-3xl font-bold text-text">
                      {key.includes("paise") && typeof value === "number"
                        ? formatMoney(value, { showPaise: true })
                        : typeof value === "number" ? value.toLocaleString("en-IN") : String(value)}
                    </span>
                  </div>
                  {href ? (
                    <span className="mt-2 text-xs font-medium text-action">View related →</span>
                  ) : null}
                </>
              );
              const className =
                "bg-surface border border-line rounded-card p-4 border-l-4 border-l-line shadow-card flex flex-col justify-center transition-colors hover:bg-surface-hover/40";
              return href ? (
                <Link key={key} href={href} className={className}>
                  {tile}
                </Link>
              ) : (
                <div key={key} className={className}>
                  {tile}
                </div>
              );
            }) : null}
          </div>
        )}
      </div>
    </div>
  );
}
