"use client";

import { formatDate } from "@vsolve/ui";
import { ArrowUpRight, Clock, Coins, Sparkles } from "lucide-react";
import type { CoinTransaction } from "../queries";

interface CoinsTransactionListProps {
  transactions: CoinTransaction[];
}

function getCoinTxnMeta(kind: CoinTransaction["kind"]) {
  switch (kind) {
    case "EARN_PROMISE":
      return {
        label: "Coins Promised",
        icon: Sparkles,
        isCredit: true,
        tone: "info" as const,
      };
    case "UNLOCK":
      return {
        label: "Coins Unlocked",
        icon: Coins,
        isCredit: true,
        tone: "success" as const,
      };
    case "BURN":
      return {
        label: "Redeemed at Checkout",
        icon: ArrowUpRight,
        isCredit: false,
        tone: "neutral" as const,
      };
    case "RESERVE":
      return {
        label: "Held for Checkout",
        icon: Clock,
        isCredit: false,
        tone: "warning" as const,
      };
    case "RELEASE":
      return {
        label: "Hold Released",
        icon: Coins,
        isCredit: true,
        tone: "info" as const,
      };
    case "EXPIRE":
      return {
        label: "Expired",
        icon: Clock,
        isCredit: false,
        tone: "warning" as const,
      };
    case "CANCEL":
      return {
        label: "Cancelled (booking refunded)",
        icon: Clock,
        isCredit: false,
        tone: "warning" as const,
      };
    case "REVERSE":
      return {
        label: "Reward withdrawn",
        icon: Clock,
        isCredit: false,
        tone: "warning" as const,
      };
    case "ADJUSTMENT":
    default:
      return {
        label: "Adjustment",
        icon: Sparkles,
        isCredit: true,
        tone: "neutral" as const,
      };
  }
}

export function CoinsTransactionList({ transactions }: CoinsTransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-card border border-[#e7e2da] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
          <Clock className="size-6" />
        </div>
        <h3 className="mt-3 text-sm font-bold text-navy-900">No coins activity yet</h3>
        <p className="mt-1 text-xs text-text-secondary max-w-sm mx-auto">
          Complete bookings and refer friends to earn V Coins. Your coin activity will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-[#e7e2da] bg-white shadow-sm overflow-hidden">
      <div className="border-b border-[#eee9e0] px-6 py-4">
        <h2 className="text-base font-bold text-navy-900">Coins Activity History</h2>
      </div>

      <div className="divide-y divide-[#eee9e0]">
        {transactions.map((txn) => {
          const meta = getCoinTxnMeta(txn.kind);
          const Icon = meta.icon;
          const formattedDate = formatDate(txn.created_at);

          return (
            <div key={txn.id} className="flex items-center justify-between px-6 py-4 hover:bg-[#FAF9F7]/60 transition-colors">
              <div className="flex items-center gap-3.5">
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                    meta.isCredit ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <Icon className="size-4.5" />
                </span>
                <div>
                  <span className="text-sm font-semibold text-navy-900">{meta.label}</span>
                  <span className="block text-xs text-text-muted mt-0.5">{formattedDate}</span>
                </div>
              </div>

              <div className="text-right">
                <span
                  data-numeric
                  className={`text-sm font-bold tabular-nums ${
                    meta.isCredit ? "text-emerald-700" : "text-slate-700"
                  }`}
                >
                  {meta.isCredit ? "+" : "-"}
                  {txn.amount.toLocaleString("en-IN")} coins
                </span>
                {txn.notes && (
                  <span className="block text-[11px] text-text-muted max-w-[140px] truncate">
                    {txn.notes}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
