"use client";

import { Badge, Button, Card, ErrorState, Spinner, StatCard, formatMoney } from "@vsolve/ui";

import { usePartnerBalance, usePartnerLedger, usePartnerPayoutAccount } from "../queries";

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
  PENDING: "On hold",
  AVAILABLE: "Ready",
  RESERVED: "In the next run",
  PAID: "Paid",
  RELEASED: "Back in the queue",
};

export function EarningsPanel() {
  const balance = usePartnerBalance();
  const ledger = usePartnerLedger();
  const account = usePartnerPayoutAccount();

  if (balance.isPending) {
    return (
      <Card className="flex items-center gap-2 p-6 text-text-secondary">
        <Spinner size="sm" />
        Loading your earnings…
      </Card>
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

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ready to be paid" value={formatMoney(data.available_paise)} />
        <StatCard label="In the next run" value={formatMoney(data.reserved_paise)} />
        <StatCard label="On hold" value={formatMoney(data.pending_paise)} />
        <StatCard label="Paid so far" value={formatMoney(data.paid_paise)} />
      </div>

      {data.pending_paise > 0 ? (
        <p className="rounded-control bg-warning-surface p-3 text-sm text-warning-text">
          Some of your earnings are on hold while we look into a job. We will release them as soon
          as that is settled.
        </p>
      ) : null}

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-text">How you get paid</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          We pay out in a weekly run that our team reviews before it goes out. There is no
          withdraw button — you do not need to do anything.
        </p>

        {account.data ? (
          <p className="mt-3 text-sm text-text-secondary">
            Paying into <span data-numeric>••••{account.data.account_last4}</span>
            {account.data.is_payable_now ? null : (
              <>
                {" — "}
                <span className="text-warning-text">
                  not usable until{" "}
                  <time dateTime={account.data.effective_from}>
                    {new Date(account.data.effective_from).toLocaleDateString("en-IN")}
                  </time>
                  . New accounts wait a day before we pay into them, so a change you did not make
                  cannot take your money straight away.
                </span>
              </>
            )}
          </p>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">
            No payout account yet. Your account details are collected during onboarding.
          </p>
        )}
      </Card>

      <section aria-labelledby="ledger">
        <h2 id="ledger" className="text-sm font-semibold text-text">
          Your earnings
        </h2>

        {ledger.isPending ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
            <Spinner size="sm" />
            Loading…
          </p>
        ) : null}

        {!ledger.isPending && entries.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">
            Nothing yet. Completed jobs appear here once the customer confirms them.
          </p>
        ) : null}

        <ul className="mt-2 list-none space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-card border border-line bg-surface p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={STATUS_TONE[entry.status] ?? "neutral"}>
                  {STATUS_LABEL[entry.status] ?? entry.status}
                </Badge>
                <span data-numeric className="font-semibold text-text">
                  {formatMoney(entry.net_paise)}
                </span>
              </div>
              <p className="mt-2 text-text-secondary">
                <span data-numeric>{formatMoney(entry.gross_paise)}</span> for the work
                {entry.commission_paise > 0 ? (
                  <>
                    {" less "}
                    <span data-numeric>{formatMoney(entry.commission_paise)}</span> commission
                  </>
                ) : null}
              </p>
              {entry.reason ? (
                <p className="mt-1 text-text-secondary">{entry.reason}</p>
              ) : null}
            </li>
          ))}
        </ul>

        {ledger.hasNextPage ? (
          <Button
            className="mt-3"
            variant="outline"
            loading={ledger.isFetchingNextPage}
            loadingLabel="Loading"
            onClick={() => void ledger.fetchNextPage()}
          >
            Load more
          </Button>
        ) : null}
      </section>
    </div>
  );
}
