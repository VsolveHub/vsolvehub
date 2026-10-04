import { Wallet } from "lucide-react";

import { DIRECT_PAYMENT_NOTE } from "../model";

/**
 * "Payment method: Direct payment to owner". V Solve Hub introduces guest and owner; it never
 * collects the rent, so this says so wherever a price is shown.
 */
export function StayPaymentNote({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-text-secondary">
        <Wallet className="mt-0.5 size-3.5 shrink-0 text-text-secondary" aria-hidden />
        <span>
          <strong className="font-semibold text-text">Direct payment to owner.</strong>{" "}
          {DIRECT_PAYMENT_NOTE}
        </span>
      </p>
    );
  }
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xs">
      <h3 className="flex items-center gap-2 text-sm font-bold text-text">
        <Wallet className="size-4 text-action" aria-hidden />
        Payment method
      </h3>
      <p className="mt-2 text-sm font-semibold text-text">Direct payment to owner</p>
      <p className="mt-1 text-xs leading-relaxed text-text-secondary">{DIRECT_PAYMENT_NOTE}</p>
    </div>
  );
}
