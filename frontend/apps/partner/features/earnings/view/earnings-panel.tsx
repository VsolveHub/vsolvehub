"use client";

import { Badge, Button, Card, ErrorState, Spinner, formatMoney } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";

import {
  usePartnerBalance,
  usePartnerLedger,
  usePartnerPayoutAccount,
  usePartnerPerformance,
} from "../queries";
import { EarningsChart, toDailyEarnings } from "./earnings-chart";

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

export function EarningsPanel() {
  const balance = usePartnerBalance();
  const ledger = usePartnerLedger();
  const account = usePartnerPayoutAccount();
  const performance = usePartnerPerformance();

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

      {/* The one number that answers "what is actually coming to me". Four equal
          tiles made the reader compare before they could read; a hero and three
          supports say which is the answer and which are context. */}
      <Card className="p-5">
        <p className="text-sm font-semibold text-text-secondary">Coming to you</p>
        <p data-numeric className="mt-1 text-4xl font-bold leading-tight text-text">
          {formatMoney(data.available_paise)}
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          We pay this out in the next payment run.
        </p>
      </Card>

      {/* Three colour-coded plates, one per balance status — the same info/
          warning/success tones `STATUS_TONE` already assigns to RESERVED/
          PENDING/PAID in the ledger below, just carried up to this
          breakdown so the two agree at a glance. */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-plate border border-info-line bg-info-surface p-3">
          <p className="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-info-text">
            <Pictogram name="held" size="xs" />
            Waiting
          </p>
          <p data-numeric className="mt-1 text-lg font-bold text-info-text">
            {formatMoney(data.reserved_paise)}
          </p>
        </div>
        <div className="rounded-plate border border-warning-line bg-warning-surface p-3">
          <p className="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-warning-text">
            <Pictogram name="later" size="xs" />
            On hold
          </p>
          <p data-numeric className="mt-1 text-lg font-bold text-warning-text">
            {formatMoney(data.pending_paise)}
          </p>
        </div>
        <div className="rounded-plate border border-success-line bg-success-surface p-3">
          <p className="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-success-text">
            <Pictogram name="done" size="xs" />
            Paid
          </p>
          <p data-numeric className="mt-1 text-lg font-bold text-success-text">
            {formatMoney(data.paid_paise)}
          </p>
        </div>
      </div>

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
            <EarningsChart days={toDailyEarnings(performance.data?.daily ?? [])} />
          )}
        </div>
      </Card>

      {/* Payout method */}
      <Card className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-surface text-info-text">
          <Pictogram name="money" size="sm" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">Payout Method</p>
          {account.data ? (
            <p className="text-sm text-text-secondary">
              Paying into <span data-numeric>••••{account.data.account_last4}</span>
              {account.data.is_payable_now ? null : (
                <>
                  {" — "}
                  <span className="text-warning-text">
                    not usable until{" "}
                    <time dateTime={account.data.effective_from}>
                      {new Date(account.data.effective_from).toLocaleDateString("en-IN")}
                    </time>
                  </span>
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-text-secondary">
              No payout account yet.
            </p>
          )}
        </div>
      </Card>

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
            Nothing yet. Completed jobs appear here once the customer confirms them.
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
