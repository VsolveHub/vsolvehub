"use client";

import { Badge, Button, Card, ErrorState, Skeleton, Spinner, formatMoney } from "@vsolve/ui";

import { Pictogram, type PictogramName } from "@/components/pictogram";

import { usePartnerBalance, usePartnerLedger, usePartnerPerformance } from "../queries";
import { EarningsChart, toDailyEarnings } from "./earnings-chart";
import { PayoutAccountCard } from "./payout-account-card";

/**
 * What the Partner has earned.
 *
 * ## Four numbers, not one
 *
 * "You have ₹4,200" is not true in any useful sense when ₹1,800 of it is held behind an open
 * quality case. A Partner planning their week needs to know which part is actually coming, so
 * the balance is shown split and the held part is labelled rather than folded into a total.
 *
 * ## No withdraw button, and that is the product
 *
 * M1 pays through a reviewed weekly run. `05-pricing-payments-and-settlement.md` rules out
 * on-demand withdrawal until account-change cooling, fraud monitoring and reconciliation are all
 * proven, and two of those three are still open. A button here would promise something that does
 * not exist — the screen says when money moves instead.
 *
 * ## The cooling period is explained, not hidden
 *
 * A newly added account is verified and still unpayable for a day. Without saying so, the
 * Partner sees a verified account and no money, which reads as a bug.
 */

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning"> = {
  PENDING: "warning",
  AVAILABLE: "info",
  RESERVED: "info",
  PAID: "success",
  RELEASED: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "ON HOLD",
  AVAILABLE: "READY",
  RESERVED: "IN NEXT RUN",
  PAID: "PAID",
  RELEASED: "RELEASED",
};

const BALANCE_TONE = {
  info: "border-info-line bg-info-surface text-info-text",
  warning: "border-warning-line bg-warning-surface text-warning-text",
  success: "border-success-line bg-success-surface text-success-text",
} as const;

function BalanceTile({
  label,
  amountPaise,
  tone,
  icon,
}: {
  label: string;
  amountPaise: number;
  tone: keyof typeof BALANCE_TONE;
  icon: PictogramName;
}) {
  return (
    <div className={`rounded-plate border p-2.5 sm:p-3 ${BALANCE_TONE[tone]}`}>
      <p className="flex items-center gap-1 truncate text-[0.625rem] font-semibold uppercase tracking-wide sm:text-[0.6875rem]">
        <Pictogram name={icon} size="xs" />
        {label}
      </p>
      <p data-numeric className="mt-1 truncate text-base font-bold sm:text-lg">
        {formatMoney(amountPaise)}
      </p>
    </div>
  );
}

export function EarningsPanel() {
  const balance = usePartnerBalance();
  const ledger = usePartnerLedger();
  const performance = usePartnerPerformance();

  if (balance.isPending) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading your earnings">
        <Skeleton className="h-32 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
      </div>
    );
  }

  if (balance.isError || !balance.data) {
    return (
      <ErrorState
        title="We could not load your earnings"
        message="Nothing has changed. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void balance.refetch()}
      />
    );
  }

  const data = balance.data;
  const entries = ledger.data?.pages.flatMap((page) => page.results) ?? [];
  const vsolveOutstanding = data.available_paise + data.reserved_paise + data.pending_paise;
  const monthDirect = performance.data?.month_direct_paise ?? 0;

  return (
    <div className="space-y-5">
      {/* Warning banner */}
      {data.pending_paise > 0 ? (
        <div className="flex gap-3 rounded-card border border-warning-line bg-warning-surface p-4">
          <Pictogram name="later" size="sm" className="mt-0.5 shrink-0 text-warning-text" />
          <div>
            <p className="text-sm font-semibold text-warning-text">
              Some of your earnings are on hold
            </p>
            <p className="mt-0.5 text-sm text-warning-text/80">
              Review the required documentation to release funds.
            </p>
          </div>
        </div>
      ) : null}

      {/* Earnings lead. A direct-paid crew job is real income even though it is
          not money Vsolve can pay a second time. */}
      <Card className="p-5">
        <p className="text-sm font-semibold text-text-secondary">Total earned this month</p>
        {performance.isPending ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
            <Spinner size="sm" />
            Loading this month…
          </p>
        ) : performance.isError || !performance.data ? (
          <p className="mt-2 text-sm text-text-secondary">This total is temporarily unavailable.</p>
        ) : (
          <>
            <p data-numeric className="mt-1 text-4xl font-bold leading-tight text-text">
              {formatMoney(performance.data.month_net_paise)}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {monthDirect > 0
                ? `${formatMoney(monthDirect)} was paid directly by customers.`
                : "Includes direct customer payments and work paid through Vsolve."}
            </p>
          </>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-text-secondary">Vsolve payout balance</h2>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              Money Vsolve collected and still has to pay you.
            </p>
          </div>
          <p data-numeric className="shrink-0 text-2xl font-bold text-text">
            {formatMoney(vsolveOutstanding)}
          </p>
        </div>
        {vsolveOutstanding === 0 && monthDirect > 0 ? (
          <p className="mt-3 rounded-plate bg-info-surface px-3 py-2 text-xs leading-5 text-info-text">
            Nothing is due from Vsolve because this month’s {formatMoney(monthDirect)} was paid
            directly by customers.
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <BalanceTile label="Ready" amountPaise={data.available_paise} tone="info" icon="money" />
          <BalanceTile label="Next run" amountPaise={data.reserved_paise} tone="info" icon="held" />
          <BalanceTile label="On hold" amountPaise={data.pending_paise} tone="warning" icon="later" />
          <BalanceTile label="Paid" amountPaise={data.paid_paise} tone="success" icon="done" />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-bold text-text">How you are doing</h2>
        <div className="mt-3">
          {/* The series is the server's, not a regrouping of the ledger page this screen
              happens to hold — see `toDailyEarnings`. Its own loading and failure states are
              rendered here rather than falling back to the ledger, because a chart drawn from
              a partial source is the failure this replaced. */}
          {performance.isError ? (
            <p className="rounded-card border border-line bg-surface-sunken p-4 text-sm text-text-secondary">
              We could not load your last 7 days just now. Your balance above is still correct.
            </p>
          ) : performance.isPending ? (
            <p className="flex items-center gap-2 p-4 text-sm text-text-secondary">
              <Spinner size="sm" />
              Loading your last 7 days…
            </p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-plate border border-line bg-surface-sunken p-3">
                  <p className="text-xs font-semibold text-text-secondary">Earned today</p>
                  <p data-numeric className="mt-1 text-xl font-bold text-text">
                    {formatMoney(performance.data?.today_net_paise ?? 0)}
                  </p>
                </div>
                <div className="rounded-plate border border-line bg-surface-sunken p-3">
                  <p className="text-xs font-semibold text-text-secondary">
                    Jobs done this month
                  </p>
                  <p data-numeric className="mt-1 text-xl font-bold text-text">
                    {performance.data?.month_jobs ?? 0}
                  </p>
                </div>
              </div>
              <EarningsChart days={toDailyEarnings(performance.data?.daily ?? [])} />
            </>
          )}
        </div>
      </Card>

      <PayoutAccountCard />

      {/* Recent Activity */}
      <section aria-labelledby="ledger">
        <h2 id="ledger" className="text-base font-bold text-text">
          Recent Activity
        </h2>

        {ledger.isPending ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
            <Spinner size="sm" />
            Loading…
          </p>
        ) : null}

        {!ledger.isPending && entries.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">
            No Vsolve payout activity yet. Direct customer payments are included in the earnings
            totals above.
          </p>
        ) : null}

        {entries.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-card border border-line">
            {/* Table header */}
            <div className="flex items-center justify-between bg-surface-sunken px-4 py-2">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted">
                Status
              </span>
              <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted">
                Amount
              </span>
            </div>

            {/* Entries */}
            <ul className="list-none divide-y divide-line">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 bg-surface px-4 py-3"
                >
                  <div className="min-w-0">
                    <Badge tone={STATUS_TONE[entry.status] ?? "neutral"}>
                      {STATUS_LABEL[entry.status] ?? entry.status}
                    </Badge>
                    <p className="mt-1 text-sm text-text-secondary">
                      <span data-numeric className="font-medium text-text">
                        {formatMoney(entry.gross_paise)}
                      </span>
                      {" for the work"}
                      {entry.commission_paise > 0 ? (
                        <>
                          {" less "}
                          <span data-numeric>{formatMoney(entry.commission_paise)}</span>
                          {" commission"}
                        </>
                      ) : null}
                    </p>
                    {entry.reason ? (
                      <p className="mt-0.5 text-xs text-text-muted">{entry.reason}</p>
                    ) : null}
                  </div>
                  <span data-numeric className="shrink-0 text-base font-bold text-text">
                    {formatMoney(entry.net_paise)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {ledger.hasNextPage ? (
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              icon={<Pictogram name="more" size="xs" />}
              loading={ledger.isFetchingNextPage}
              loadingLabel="Loading"
              onClick={() => void ledger.fetchNextPage()}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
