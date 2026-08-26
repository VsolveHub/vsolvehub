"use client";

import { Button, ErrorState, cn, formatMoney } from "@vsolve/ui";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Pictogram, type PictogramName } from "@/components/pictogram";
import { Sheet } from "@/features/shell/view/sheet";
import { SkeletonMoney } from "@/features/shell/view/skeletons";

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
 * "You have ₹4,200" is not true in any useful sense when ₹1,800 of it is held
 * behind an open quality case. A Partner planning their week needs to know
 * which part is actually coming, so the balance is shown split and the held
 * part is labelled rather than folded into a total.
 *
 * ## No withdraw button, and that is the product
 *
 * M1 pays through a reviewed weekly run.
 * `05-pricing-payments-and-settlement.md` rules out on-demand withdrawal until
 * account-change cooling, fraud monitoring and reconciliation are all proven,
 * and two of those three are still open. A button here would promise something
 * that does not exist — the screen says when money moves instead.
 *
 * ## What the redesign changed
 *
 * The ledger below used to be a table: a two-column header strip
 * ("Status" / "Amount") over rows carrying a status badge, a sentence
 * reconstructing the arithmetic ("₹800 for the work less ₹120 commission") and
 * a figure. That is a desktop report rendered on a 360px phone — the sentence
 * wrapped to three lines on every row, and the header strip labelled columns
 * that stopped lining up the moment it did.
 *
 * It is a statement now: one row per entry, the net figure as the value, the
 * gross-and-commission breakdown moved behind a tap into a sheet for the rows
 * where somebody actually wants to check the maths. Same numbers, same source,
 * none of them computed here.
 */

const STATUS_LABEL: Record<string, string> = {
  PENDING: "On hold",
  AVAILABLE: "Ready",
  RESERVED: "In next run",
  PAID: "Paid",
  RELEASED: "Released",
};

const STATUS_SKIN: Record<string, string> = {
  PENDING: "bg-warning-surface text-warning-text",
  AVAILABLE: "bg-info-surface text-info-text",
  RESERVED: "bg-info-surface text-info-text",
  PAID: "bg-success-surface text-success-text",
  RELEASED: "bg-surface-sunken text-text-muted",
};

type LedgerEntry = NonNullable<
  ReturnType<typeof usePartnerLedger>["data"]
>["pages"][number]["results"][number];

export function EarningsPanel() {
  const balance = usePartnerBalance();
  const ledger = usePartnerLedger();
  const account = usePartnerPayoutAccount();
  const performance = usePartnerPerformance();

  const [inspecting, setInspecting] = useState<LedgerEntry | null>(null);

  if (balance.isPending) return <SkeletonMoney />;

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
    <div className="flex flex-col gap-4">
      {data.pending_paise > 0 ? (
        <div className="flex gap-3 rounded-card border border-warning-line bg-warning-surface p-3.5">
          <Pictogram name="later" size="sm" className="mt-0.5 shrink-0 text-warning-text" />
          <div>
            <p className="text-body font-bold text-warning-text">
              Some of your earnings are on hold
            </p>
            <p className="mt-0.5 text-caption text-warning-text/85">
              Review the required documentation to release funds.
            </p>
          </div>
        </div>
      ) : null}

      {/* The one number that answers "what is actually coming to me". Four equal
          tiles made the reader compare before they could read; a hero and three
          supports say which is the answer and which are context. */}
      <div className="rounded-card bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] p-5 shadow-card">
        <p className="text-micro uppercase text-navy-200">Coming to you</p>
        <p className="pv-num mt-2 text-hero text-surface">{formatMoney(data.available_paise)}</p>
        <p className="mt-2.5 text-caption leading-relaxed text-navy-200">
          We pay this out in the next payment run.
        </p>
      </div>

      {/* Three colour-coded plates, one per balance status — the same tones the
          ledger below assigns to RESERVED / PENDING / PAID, carried up so the
          two agree at a glance. */}
      <div className="grid grid-cols-3 gap-2.5">
        <Plate
          glyph="held"
          label="Waiting"
          value={formatMoney(data.reserved_paise)}
          skin="border-info-line bg-info-surface text-info-text"
        />
        <Plate
          glyph="later"
          label="On hold"
          value={formatMoney(data.pending_paise)}
          skin="border-warning-line bg-warning-surface text-warning-text"
        />
        <Plate
          glyph="done"
          label="Paid"
          value={formatMoney(data.paid_paise)}
          skin="border-success-line bg-success-surface text-success-text"
        />
      </div>

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-title text-text">How you are doing</h2>
        <div className="mt-3">
          {/* The series is the server's, not a regrouping of the ledger page this
              screen happens to hold — see `toDailyEarnings`. Its own loading and
              failure states are rendered here rather than falling back to the
              ledger, because a chart drawn from a partial source is the failure
              this replaced. */}
          {performance.isError ? (
            <p className="rounded-control border border-line bg-surface-sunken p-3.5 text-caption text-text-secondary">
              We could not load your last 7 days just now. Your balance above is
              still correct.
            </p>
          ) : performance.isPending ? (
            <span className="pv-shimmer block h-32 rounded-control" role="status" aria-label="Loading your last 7 days" />
          ) : (
            <EarningsChart days={toDailyEarnings(performance.data?.daily ?? [])} />
          )}
        </div>
      </section>

      <section className="flex items-center gap-3 rounded-card border border-line bg-surface p-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-tile bg-info-surface text-info-text">
          <Pictogram name="money" size="md" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold text-text">Where we pay you</p>
          {account.data ? (
            <p className="text-caption text-text-secondary">
              Paying into <span className="pv-num">••••{account.data.account_last4}</span>
              {account.data.is_payable_now ? null : (
                <>
                  {" — "}
                  <span className="font-semibold text-warning-text">
                    not usable until{" "}
                    <time dateTime={account.data.effective_from}>
                      {new Date(account.data.effective_from).toLocaleDateString("en-IN")}
                    </time>
                  </span>
                </>
              )}
            </p>
          ) : (
            <p className="text-caption text-text-secondary">No payout account yet.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="ledger" className="flex flex-col gap-2.5">
        <h2 id="ledger" className="text-micro uppercase text-text-muted">
          Recent activity
        </h2>

        {ledger.isPending ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading your activity">
            <span aria-hidden className="pv-shimmer block h-15 rounded-card" />
            <span aria-hidden className="pv-shimmer block h-15 rounded-card" />
            <span aria-hidden className="pv-shimmer block h-15 rounded-card" />
          </div>
        ) : null}

        {!ledger.isPending && entries.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-caption leading-relaxed text-text-secondary">
            Nothing yet. Completed jobs appear here once the customer confirms
            them.
          </p>
        ) : null}

        {entries.length > 0 ? (
          <ul className="flex list-none flex-col gap-2 p-0">
            {entries.map((entry) => (
              <li key={entry.id}>
                <LedgerRow entry={entry} onInspect={() => setInspecting(entry)} />
              </li>
            ))}
          </ul>
        ) : null}

        {ledger.hasNextPage ? (
          <Button
            variant="outline"
            block
            loading={ledger.isFetchingNextPage}
            loadingLabel="Loading"
            onClick={() => void ledger.fetchNextPage()}
          >
            Show earlier
          </Button>
        ) : null}
      </section>

      <LedgerSheet entry={inspecting} onClose={() => setInspecting(null)} />
    </div>
  );
}

function Plate({
  glyph,
  label,
  value,
  skin,
}: {
  glyph: PictogramName;
  label: string;
  value: string;
  skin: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-card border p-3", skin)}>
      <span className="flex items-center gap-1 text-micro uppercase">
        <Pictogram name={glyph} size="xs" />
        {label}
      </span>
      <span className="pv-num truncate text-title font-extrabold">{value}</span>
    </div>
  );
}

/**
 * One line of the statement.
 *
 * The net figure is the value, because that is the Partner's own money. The
 * gross and the commission are real and are one tap away — the row is a button
 * rather than a static block precisely so the arithmetic stays checkable
 * without printing it on every row.
 */
function LedgerRow({ entry, onInspect }: { entry: LedgerEntry; onInspect: () => void }) {
  const label = STATUS_LABEL[entry.status] ?? entry.status;

  return (
    <button
      type="button"
      onClick={onInspect}
      className="pv-tap pv-press flex min-h-15 w-full items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={cn(
            "w-fit rounded-pill px-2 py-0.5 text-micro uppercase",
            STATUS_SKIN[entry.status] ?? "bg-surface-sunken text-text-muted",
          )}
        >
          {label}
        </span>
        {entry.reason ? (
          <span className="truncate text-caption text-text-muted">{entry.reason}</span>
        ) : null}
      </span>
      <span className="pv-num shrink-0 text-title font-extrabold text-text">
        {formatMoney(entry.net_paise)}
      </span>
      <ChevronRight size={18} className="shrink-0 text-text-muted" aria-hidden />
    </button>
  );
}

/**
 * The arithmetic behind one line.
 *
 * Every figure here is served, not derived: `gross_paise`, `commission_paise`
 * and `net_paise` are three separate fields on the entry, and this screen
 * deliberately does not subtract one from another to check them. If the server
 * and the display ever disagree it should be visible, not silently reconciled
 * by the client.
 */
function LedgerSheet({ entry, onClose }: { entry: LedgerEntry | null; onClose: () => void }) {
  return (
    <Sheet
      open={entry !== null}
      onClose={onClose}
      title="How this was worked out"
      description={entry === null ? undefined : (STATUS_LABEL[entry.status] ?? entry.status)}
    >
      {entry === null ? null : (
        <dl className="flex list-none flex-col gap-0 p-0">
          <Line term="For the work" value={formatMoney(entry.gross_paise)} />
          {entry.commission_paise > 0 ? (
            <Line term="Vsolve commission" value={`− ${formatMoney(entry.commission_paise)}`} />
          ) : null}
          <Line term="Your money" value={formatMoney(entry.net_paise)} emphasis />
          {entry.reason ? <Line term="Note" value={entry.reason} /> : null}
        </dl>
      )}
    </Sheet>
  );
}

function Line({
  term,
  value,
  emphasis = false,
}: {
  term: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-3",
        emphasis ? "border-t-2 border-text/15" : "border-b border-line",
      )}
    >
      <dt className={cn("text-body", emphasis ? "font-bold text-text" : "text-text-secondary")}>
        {term}
      </dt>
      <dd
        className={cn(
          "pv-num text-right",
          emphasis ? "text-figure text-text" : "text-body font-semibold text-text",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
