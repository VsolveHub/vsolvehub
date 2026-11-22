"use client";

import { Skeleton, cn, formatMoney } from "@vsolve/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  usePayoutAccounts,
  usePayoutBatches,
  useWithdrawals,
  type OperationsWithdrawal,
  type PayoutBatchRow,
} from "../queries";

/** What one page of a list says about how many there are: exact, or "at least". */
export interface Tally {
  count: number;
  more: boolean;
  paise: number;
}

/** Rows and whether the server has more pages. Exported for tests. */
export function tally<T>(
  pages: { results: T[]; next: string | null }[] | undefined,
  paiseOf: (row: T) => number = () => 0,
): Tally {
  const rows = pages?.flatMap((page) => page.results) ?? [];
  return {
    count: rows.length,
    more: Boolean(pages?.at(-1)?.next),
    paise: rows.reduce((sum, row) => sum + paiseOf(row), 0),
  };
}

/** `3`, or `20+` when only the first page was read. */
export function countLabel(t: Tally): string {
  return `${t.count}${t.more ? "+" : ""}`;
}

const withdrawalPaise = (row: OperationsWithdrawal) => row.transfer?.balance_paise ?? 0;
const runPaise = (row: PayoutBatchRow) => row.total_paise;

export interface PayoutsAttention {
  loading: boolean;
  accounts: Tally;
  withdrawals: Tally;
  runsToApprove: Tally;
  runsToPay: Tally;
  sending: Tally;
}

/** The counts the Payouts page leads with, and its tab badges. Reads first pages only. */
export function usePayoutsAttention(): PayoutsAttention {
  const accounts = usePayoutAccounts("PENDING");
  const withdrawals = useWithdrawals("PENDING_APPROVAL");
  const withdrawalsSending = useWithdrawals("PAYING");
  const runsToApprove = usePayoutBatches({ kind: "RUN", status: "PENDING_APPROVAL" });
  const runsToPay = usePayoutBatches({ kind: "RUN", status: "APPROVED" });
  const runsSending = usePayoutBatches({ kind: "RUN", status: "PAYING" });

  const sendingWithdrawals = tally(withdrawalsSending.data?.pages, withdrawalPaise);
  const sendingRuns = tally(runsSending.data?.pages, runPaise);

  return {
    loading: [accounts, withdrawals, runsToApprove, runsToPay].some((query) => query.isPending),
    accounts: tally(accounts.data?.pages),
    withdrawals: tally(withdrawals.data?.pages, withdrawalPaise),
    runsToApprove: tally(runsToApprove.data?.pages, runPaise),
    runsToPay: tally(runsToPay.data?.pages, runPaise),
    sending: {
      count: sendingWithdrawals.count + sendingRuns.count,
      more: sendingWithdrawals.more || sendingRuns.more,
      paise: sendingWithdrawals.paise + sendingRuns.paise,
    },
  };
}

function Tile({
  label,
  value,
  detail,
  tone,
  onOpen,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "action" | "calm" | "info";
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex min-h-24 flex-col items-start rounded-card border px-4 py-3 text-left transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        tone === "action"
          ? "border-warning-line bg-warning-surface hover:bg-warning-surface/70"
          : tone === "info"
            ? "border-line bg-info-surface hover:bg-info-surface/70"
            : "border-line bg-surface hover:bg-surface-sunken",
      )}
    >
      <span className="text-xs font-semibold text-text-secondary">{label}</span>
      <span data-numeric className="mt-1 text-2xl font-bold text-text">
        {value}
      </span>
      <span className="mt-0.5 text-xs text-text-secondary">{detail}</span>
    </button>
  );
}

/**
 * What needs Operations on the Payouts page, before any tab is opened: one tile per job, each
 * opening the tab that does it. Zero is shown as "nothing waiting" rather than hidden, so an
 * empty queue reads as checked, not as missing.
 */
export function PayoutsAttentionSummary({ attention }: { attention: PayoutsAttention }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const open = (tab: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", tab);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  if (attention.loading) {
    return <Skeleton className="h-24 w-full" />;
  }

  const { accounts, withdrawals, runsToApprove, runsToPay, sending } = attention;
  const runsWaiting = runsToApprove.count + runsToPay.count;
  const runsMore = runsToApprove.more || runsToPay.more;
  const nothing = (t: Tally) => t.count === 0 && !t.more;

  return (
    <section aria-label="Needs you" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-text-secondary">Needs you</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Withdrawals to approve"
          value={countLabel(withdrawals)}
          detail={
            nothing(withdrawals)
              ? "Nothing waiting"
              : `${formatMoney(withdrawals.paise)} held for partners`
          }
          tone={nothing(withdrawals) ? "calm" : "action"}
          onOpen={() => open("withdrawals")}
        />
        <Tile
          label="Bank accounts to verify"
          value={countLabel(accounts)}
          detail={nothing(accounts) ? "Nothing waiting" : "Partners cannot be paid until checked"}
          tone={nothing(accounts) ? "calm" : "action"}
          onOpen={() => open("accounts")}
        />
        <Tile
          label="Payout runs waiting"
          value={`${runsWaiting}${runsMore ? "+" : ""}`}
          detail={
            runsWaiting === 0 && !runsMore
              ? "Nothing waiting"
              : `${countLabel(runsToApprove)} to approve · ${countLabel(runsToPay)} to pay`
          }
          tone={runsWaiting === 0 && !runsMore ? "calm" : "action"}
          onOpen={() => open("runs")}
        />
        <Tile
          label="On the way to banks"
          value={formatMoney(sending.paise)}
          detail={
            nothing(sending)
              ? "Nothing sending right now"
              : `${countLabel(sending)} transfer${sending.count === 1 && !sending.more ? "" : "s"} sending`
          }
          tone="info"
          onOpen={() => open(sending.count > 0 && runsWaiting === 0 ? "withdrawals" : "runs")}
        />
      </div>
    </section>
  );
}
