import type { ReactNode } from "react";

import { cn } from "@vsolve/ui";

/**
 * One priced line in an estimate.
 *
 * Collapsed it is a ledger entry — name, what it works out to, and the amount —
 * at 59px, so six lines and three section subtotals fit above the fold on a
 * 390x844 phone. Open it grows the controls that change those numbers. The
 * previous build kept every control visible on every row at 110px each, which
 * fit three rows and no subtotals: a six-item job became a scroll with no
 * landmarks.
 *
 * `buyNote` is the part that is easy to mistake for decoration. These estimates
 * are labour-only, so every line implies something the customer has to go and
 * buy. Carrying that on the row means the shopping list assembles itself from
 * rows the partner is already entering, instead of being a second form nobody
 * fills in.
 *
 * Presentational. It owns no state, does no arithmetic, and formats no money —
 * `amount` arrives already run through `formatMoney`, because a component that
 * divides by 100 is a component that will one day divide twice.
 */

export interface LedgerRowProps {
  name: string;
  /**
   * Formatted amount. `null` means the partner has not priced this line yet and
   * renders the unpriced affordance — the estimate cannot be sent in that state,
   * so it has to look unfinished rather than look like zero.
   */
  amount: string | null;
  /** The working, e.g. "5 Nos × ₹80". Hidden while open, where the controls say it. */
  meta?: ReactNode;
  /** What the customer must purchase for this line, e.g. "buy 5 pcs". */
  buyNote?: string;
  open?: boolean;
  /** The remove control. Caller owns it so this component needs no handler. */
  removeSlot?: ReactNode;
  /** Controls and material fields, rendered only while open. */
  children?: ReactNode;
  className?: string;
}

export function LedgerRow({
  name,
  amount,
  meta,
  buyNote,
  open = false,
  removeSlot,
  children,
  className,
}: LedgerRowProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-surface",
        // The selected border thickens by a pixel and the padding loses one, so
        // opening a row does not resize it and shift every row below.
        open ? "border-2 border-action p-[7px_11px]" : "border border-line p-2 px-3",
        className,
      )}
    >
      <div className="flex items-baseline gap-2.5">
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-0.015em] text-text">
          {name}
        </span>

        {amount === null ? (
          <span className="shrink-0 rounded-control border border-action-line bg-action-surface px-2.5 py-1 text-[13px] font-bold text-action-active">
            Set price
          </span>
        ) : (
          <span className="shrink-0 text-base font-extrabold tracking-[-0.02em] tabular-nums text-text">
            {amount}
          </span>
        )}

        {removeSlot}
      </div>

      {!open && (meta !== undefined || buyNote !== undefined) ? (
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-medium text-text-muted">
          {meta}
          {buyNote !== undefined ? (
            <span className="inline-flex rounded-full bg-action-surface px-1.5 py-px text-[10.5px] font-bold text-action-active">
              {buyNote}
            </span>
          ) : null}
        </div>
      ) : null}

      {open ? children : null}
    </div>
  );
}
