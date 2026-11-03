"use client";

import { Badge, ErrorState, Skeleton, formatMoney } from "@vsolve/ui";
import {
  AlertTriangle,
  RotateCcw,
  Search,
  ShoppingCart,
  ToggleLeft,
  UserCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ComponentType } from "react";

import { useOperationsCases } from "@/features/cases/queries";
import { BarList } from "@/features/charts/bar-list";
import { useKillSwitches } from "@/features/kill-switches/queries";

import {
  PERIOD_LABELS,
  PREVIOUS_LABELS,
  changeBetween,
  describeChange,
  periodRanges,
  totalBookings,
  type HomePeriod,
} from "./home-model";
import { useDashboardAggregates } from "./queries";

/* -------------------------------------------------------------------------- */
/* Emergency banner                                                            */
/* -------------------------------------------------------------------------- */

const SCOPE_LABELS: Record<string, string> = {
  NOTIFICATIONS: "All notifications",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  VOICE: "Voice calls",
  PUSH: "Push notifications",
  PAYMENTS: "Payment collection",
  PAYOUTS: "Partner payouts",
  DISPATCH: "Partner dispatch",
  SERVICE_AREA: "A service area",
  SERVICE: "A service",
  M2_PURCHASES: "Crew and project purchases",
};

/** Shown only while something is switched off, because then nothing else on the page matters. */
export function KillSwitchBanner() {
  const switches = useKillSwitches();
  const engaged = (switches.data ?? []).filter((entry) => entry.is_engaged);
  if (engaged.length === 0) return null;
  return (
    <Link
      href="/operations/kill-switches"
      role="alert"
      className="flex items-start gap-3 rounded-card border border-danger-line bg-danger-surface px-4 py-3 text-danger-text hover:border-danger-text"
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
      <span className="text-sm">
        <span className="font-bold">
          {engaged.length === 1 ? "1 kill switch is on" : `${engaged.length} kill switches are on`}:
        </span>{" "}
        {engaged.map((entry) => SCOPE_LABELS[entry.scope] ?? entry.scope).join(", ")} stopped.{" "}
        <span className="underline">Review switches</span>
      </span>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Quick actions                                                               */
/* -------------------------------------------------------------------------- */

const ACTIONS: { href: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { href: "/operations/home-services", label: "Find a booking", icon: Search },
  { href: "/operations/home-services?tab=book", label: "Book for a customer", icon: ShoppingCart },
  { href: "/finance", label: "Refund a payment", icon: RotateCcw },
  { href: "/operations/loyalty", label: "Credit a customer's wallet", icon: Wallet },
  { href: "/reviews", label: "Approve partners", icon: UserCheck },
  { href: "/operations/kill-switches", label: "Kill switches", icon: ToggleLeft },
];

/** The handful of jobs an operator does many times a day, one click from Home. */
export function QuickActions() {
  return (
    <section aria-labelledby="actions-heading" className="rounded-card border border-line bg-surface shadow-card">
      <h2 id="actions-heading" className="border-b border-line px-4 py-3 text-base font-bold text-text">
        Quick actions
      </h2>
      <ul className="grid grid-cols-2 gap-px bg-line lg:grid-cols-1">
        {ACTIONS.map((action) => (
          <li key={action.href} className="bg-surface">
            <Link
              href={action.href}
              className="flex min-h-11 items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-text hover:bg-surface-hover"
            >
              <action.icon className="size-4 shrink-0 text-text-secondary" />
              {action.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Business snapshot                                                           */
/* -------------------------------------------------------------------------- */

type Aggregate = Record<string, unknown> | undefined;

function num(data: Aggregate, key: string): number {
  const value = data?.[key];
  return typeof value === "number" ? value : 0;
}

function categoriesOf(data: Aggregate): Record<string, { bookings?: number; revenue_paise?: number }> {
  const value = data?.categories;
  return value && typeof value === "object" ? (value as Record<string, { bookings?: number }>) : {};
}

interface KpiProps {
  label: string;
  value: string;
  current: number;
  previous: number;
  against: string;
  /** Refunds going up is bad news; everything else here going up is good. */
  upIsGood?: boolean;
  href: string;
  loading: boolean;
}

function Kpi({ label, value, current, previous, against, upIsGood = true, href, loading }: KpiProps) {
  const change = changeBetween(current, previous);
  const good = change.direction === "flat" ? null : (change.direction === "up") === upIsGood;
  return (
    <Link
      href={href}
      className="block rounded-card border border-line bg-surface p-4 shadow-card hover:border-line-strong"
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{label}</span>
      {loading ? (
        <>
          <Skeleton className="mt-2 h-8 w-20" />
          <Skeleton className="mt-2 h-3 w-28" />
        </>
      ) : (
        <>
          <span className="mt-1 block text-2xl font-bold text-text tabular-nums" data-numeric>
            {value}
          </span>
          <span
            className={`mt-1 block text-xs ${
              good === null ? "text-text-secondary" : good ? "text-success-text" : "text-danger-text"
            }`}
          >
            {describeChange(change, against)}
          </span>
        </>
      )}
    </Link>
  );
}

/**
 * How the business did over the chosen period, each figure against the period before it.
 * Every number is a server aggregate; this only lays them side by side.
 */
export function BusinessSnapshot({ today: todayProp }: { today?: Date }) {
  // Read once, so the ranges (and the query keys built from them) stay put between renders.
  const [today] = useState(() => todayProp ?? new Date());
  const [period, setPeriod] = useState<HomePeriod>("today");
  const { current, previous } = useMemo(() => periodRanges(period, today), [period, today]);

  const overview = useDashboardAggregates("overview", current.start, current.end);
  const overviewBefore = useDashboardAggregates("overview", previous.start, previous.end);
  const categories = useDashboardAggregates("categories", current.start, current.end);
  const categoriesBefore = useDashboardAggregates("categories", previous.start, previous.end);
  const customers = useDashboardAggregates("customer", current.start, current.end);
  const customersBefore = useDashboardAggregates("customer", previous.start, previous.end);
  const bookings = useDashboardAggregates("booking", current.start, current.end);

  const against = PREVIOUS_LABELS[period];
  const failed = overview.isError || categories.isError || customers.isError;
  const loading = (query: { isPending: boolean }, before: { isPending: boolean }) =>
    query.isPending || before.isPending;

  const bookingsNow = totalBookings(categoriesOf(categories.data));
  const bookingsBefore = totalBookings(categoriesOf(categoriesBefore.data));
  const collected = num(overview.data, "collected_gmv_paise");
  const collectedBefore = num(overviewBefore.data, "collected_gmv_paise");
  const refunds = num(overview.data, "refunds_paise");
  const refundsBefore = num(overviewBefore.data, "refunds_paise");
  const signups = num(customers.data, "new_signups");
  const signupsBefore = num(customersBefore.data, "new_signups");

  const demand = Object.entries(categoriesOf(categories.data)).map(([name, row]) => ({
    key: name,
    label: name,
    value: row.bookings ?? 0,
    detail: row.revenue_paise ? formatMoney(row.revenue_paise) : undefined,
  }));

  return (
    <section aria-labelledby="business-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="business-heading" className="text-base font-bold text-text">
            Business
          </h2>
          <p className="text-xs text-text-secondary">
            Across every service. Each service&apos;s own money is on its Money tab.
          </p>
        </div>
        <div role="group" aria-label="Period" className="inline-flex rounded-control border border-line bg-surface p-0.5">
          {(Object.keys(PERIOD_LABELS) as HomePeriod[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={period === key}
              onClick={() => setPeriod(key)}
              className={`rounded-control px-3 py-1.5 text-xs font-semibold ${
                period === key ? "bg-navy-900 text-warm-0" : "text-text-secondary hover:text-text"
              }`}
            >
              {PERIOD_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {failed ? (
        <ErrorState
          severity="warning"
          title="Business figures are unavailable"
          message="No figures are shown rather than wrong ones."
          actionLabel="Try again"
          onAction={() => {
            void overview.refetch();
            void categories.refetch();
            void customers.refetch();
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Bookings"
              value={String(bookingsNow)}
              current={bookingsNow}
              previous={bookingsBefore}
              against={against}
              href="/operations/dashboards/categories"
              loading={loading(categories, categoriesBefore)}
            />
            <Kpi
              label="Money collected"
              value={formatMoney(collected)}
              current={collected}
              previous={collectedBefore}
              against={against}
              href="/operations/dashboards/overview"
              loading={loading(overview, overviewBefore)}
            />
            <Kpi
              label="Refunded"
              value={formatMoney(refunds)}
              current={refunds}
              previous={refundsBefore}
              against={against}
              upIsGood={false}
              href="/finance"
              loading={loading(overview, overviewBefore)}
            />
            <Kpi
              label="New customers"
              value={String(signups)}
              current={signups}
              previous={signupsBefore}
              against={against}
              href="/operations/dashboards/customer"
              loading={loading(customers, customersBefore)}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-card border border-line bg-surface p-4 shadow-card lg:col-span-2">
              <h3 className="text-sm font-bold text-text">Bookings by category</h3>
              <p className="mb-3 text-xs text-text-secondary">
                Confirmed bookings, {PERIOD_LABELS[period].toLowerCase()}. Rentals and stays included.
              </p>
              {categories.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <BarList rows={demand} compact emptyText="No bookings in this period yet." />
              )}
            </div>
            <dl className="grid grid-cols-3 gap-px self-start overflow-hidden rounded-card border border-line bg-line shadow-card lg:grid-cols-1">
              {[
                { label: "Visits completed", value: num(bookings.data, "completed_bookings") },
                { label: "Visits cancelled", value: num(bookings.data, "cancelled_bookings") },
                { label: "Active partners", value: num(overview.data, "active_partners") },
              ].map((fact) => (
                <div key={fact.label} className="bg-surface px-4 py-3">
                  <dt className="text-xs text-text-secondary">{fact.label}</dt>
                  <dd className="text-lg font-bold text-text tabular-nums" data-numeric>
                    {bookings.isPending || overview.isPending ? "—" : fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* My cases                                                                    */
/* -------------------------------------------------------------------------- */

const SEVERITY_TONE: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  URGENT: "danger",
  HIGH: "danger",
  NORMAL: "warning",
  LOW: "info",
};

const MY_CASES_SHOWN = 5;

/** The operator's own open cases, soonest deadline first. The full queue is one click away. */
export function MyCases() {
  const mine = useOperationsCases({ owner: "me", overdue: false });
  const rows = (mine.data?.pages.flatMap((page) => page.results) ?? [])
    .filter((row) => row.status !== "RESOLVED" && row.status !== "CANCELLED")
    .sort((left, right) => Date.parse(left.due_at) - Date.parse(right.due_at));

  return (
    <section aria-labelledby="mine-heading" className="rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="mine-heading" className="text-base font-bold text-text">
          My cases
        </h2>
        <Link href="/operations/cases" className="text-xs font-semibold text-text-link hover:underline">
          Open the case queue
        </Link>
      </div>
      {mine.isError ? (
        <div className="p-4">
          <ErrorState
            severity="warning"
            title="Your cases could not be loaded"
            message="Nothing is shown here rather than a partial list."
            actionLabel="Try again"
            onAction={() => void mine.refetch()}
          />
        </div>
      ) : mine.isPending ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-secondary">
          You have no open cases.{" "}
          <Link href="/operations/cases" className="font-semibold text-text underline">
            Pick one up from the queue
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.slice(0, MY_CASES_SHOWN).map((row) => (
            <li key={row.id}>
              <Link
                href="/operations/cases"
                className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-hover ${
                  row.is_overdue ? "bg-danger-surface/40" : ""
                }`}
              >
                <Badge tone={SEVERITY_TONE[row.severity] ?? "neutral"}>{row.severity}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm text-text">{row.summary}</span>
                <span className={`shrink-0 text-xs ${row.is_overdue ? "font-semibold text-danger-text" : "text-text-secondary"}`}>
                  {row.is_overdue ? "Overdue" : "Due"}{" "}
                  {new Date(row.due_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </Link>
            </li>
          ))}
          {rows.length > MY_CASES_SHOWN ? (
            <li className="px-4 py-2 text-xs text-text-secondary">
              {rows.length - MY_CASES_SHOWN} more in the case queue.
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
