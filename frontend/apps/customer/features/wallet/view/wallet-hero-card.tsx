"use client";

import { Badge, formatMoney } from "@vsolve/ui";
import { Lock, ShieldCheck, Wallet as WalletIcon } from "lucide-react";
import type { WalletAccount } from "../queries";

interface WalletHeroCardProps {
  wallet: WalletAccount;
}

export function WalletHeroCard({ wallet }: WalletHeroCardProps) {
  const hasReserved = wallet.reserved_paise > 0;

  return (
    <div className="relative overflow-hidden rounded-card border border-[#e7e2da] bg-white p-6 shadow-sm md:p-8">
      {/* Background radial highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-[#FF6B00]/5 blur-2xl"
      />

      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-orange-50 text-[#EA580C]">
              <WalletIcon className="size-5" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Prepaid Vsolve Balance
            </span>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span
              data-numeric
              className="text-3xl font-extrabold tracking-tight text-navy-900 md:text-4xl"
            >
              {formatMoney(wallet.available_balance_paise)}
            </span>
            <span className="text-xs font-medium text-text-secondary">
              Available to spend
            </span>
          </div>

          {hasReserved && (
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-text-muted">
              <Lock className="size-3.5 text-amber-600" />
              <span>
                {formatMoney(wallet.reserved_paise)} temporarily held for in-progress orders
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-xl bg-[#FAF9F7] p-3.5 sm:max-w-xs border border-[#eee9e0]">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-navy-900">
            <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
            <span>1-Click Fast Checkout</span>
          </div>
          <p className="text-xs leading-relaxed text-text-secondary">
            Spend this prepaid balance on bookings. It cannot be withdrawn as cash.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Badge tone="neutral" className="text-[10px] px-2 py-0.5">
              Spend only
            </Badge>
            <Badge tone="neutral" className="text-[10px] px-2 py-0.5">
              No cash-out
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
