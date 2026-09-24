"use client";

import { Badge, formatMoney } from "@vsolve/ui";
import { ArrowDownLeft, ArrowUpRight, Clock, Gift, RefreshCcw, Wallet } from "lucide-react";
import type { WalletTransaction } from "../queries";

interface WalletTransactionListProps {
  transactions: WalletTransaction[];
}

function getTxnKindMetadata(kind: WalletTransaction["kind"]) {
  switch (kind) {
    case "TOP_UP":
      return {
        label: "Wallet Top-Up",
        icon: ArrowDownLeft,
        isCredit: true,
        tone: "success" as const,
      };
    case "CHECKOUT_DEBIT":
      return {
        label: "Booking Payment",
        icon: ArrowUpRight,
        isCredit: false,
        tone: "neutral" as const,
      };
    case "CHECKOUT_RELEASE":
      return {
        label: "Hold Released",
        icon: RefreshCcw,
        isCredit: true,
        tone: "info" as const,
      };
    case "REFUND_CREDIT":
      return {
        label: "Booking Refund",
        icon: ArrowDownLeft,
        isCredit: true,
        tone: "success" as const,
      };
    case "REFERRAL_CREDIT":
      return {
        label: "Referral Reward",
        icon: Gift,
        isCredit: true,
        tone: "success" as const,
      };
    case "ADJUSTMENT":
    default:
      return {
        label: "Adjustment",
        icon: Wallet,
        isCredit: true,
        tone: "neutral" as const,
      };
  }
}

export function WalletTransactionList({ transactions }: WalletTransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-card border border-[#e7e2da] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
          <Clock className="size-6" />
        </div>
        <h3 className="mt-3 text-sm font-bold text-navy-900">No transactions yet</h3>
        <p className="mt-1 text-xs text-text-secondary max-w-sm mx-auto">
          Your wallet top-ups, referral bonuses, and booking payments will be tracked here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-[#e7e2da] bg-white shadow-sm overflow-hidden">
      <div className="border-b border-[#eee9e0] px-6 py-4">
        <h2 className="text-base font-bold text-navy-900">Transaction History</h2>
      </div>

      <div className="divide-y divide-[#eee9e0]">
        {transactions.map((txn) => {
          const meta = getTxnKindMetadata(txn.kind);
          const Icon = meta.icon;
          const formattedDate = new Date(txn.created_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <div key={txn.id} className="flex items-center justify-between px-6 py-4 hover:bg-[#FAF9F7]/60 transition-colors">
              <div className="flex items-center gap-3.5">
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                    meta.isCredit ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <Icon className="size-4.5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-navy-900">{meta.label}</span>
                    {txn.status && txn.status !== "CAPTURED" && (
                      <Badge tone={txn.status === "RESERVED" ? "warning" : "neutral"} className="text-[10px] py-0">
                        {txn.status}
                      </Badge>
                    )}
                  </div>
                  <span className="block text-xs text-text-muted mt-0.5">{formattedDate}</span>
                </div>
              </div>

              <div className="text-right">
                <span
                  data-numeric
                  className={`text-sm font-bold tabular-nums ${
                    meta.isCredit ? "text-emerald-700" : "text-navy-900"
                  }`}
                >
                  {meta.isCredit ? "+" : "-"}
                  {formatMoney(txn.amount_paise)}
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
