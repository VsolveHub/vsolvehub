"use client";

import { Skeleton, cn } from "@vsolve/ui";

/**
 * The three-row totals card, and the rule that it is never empty.
 *
 * ## The defect this replaces
 *
 * The shipped screen rendered these three rows with an em-dash in each amount
 * whenever the rate had not resolved — under a "Published rate" panel that was
 * itself blank. Three labelled rows reading "—" is worse than no card: it looks
 * like a priced booking that came to nothing, and the one thing a rate
 * disclosure may not do is imply a figure it does not have.
 *
 * So there are exactly two states and no third. Either every amount is a number
 * the server sent, or the whole card is a skeleton the same size. A row is never
 * rendered with a placeholder where money belongs.
 *
 * ## Nothing here adds anything up
 *
 * `total = wages + fee` is the server's arithmetic and the rows are three
 * separate published fields. This formats and labels; a client that can produce
 * a number disagreeing with a refund statement eventually will.
 */

export interface MoneyRow {
  label: string;
  /** The quiet second line — what qualifies the amount. */
  note?: string;
  /** Already formatted by the server's own figure. */
  amount: string;
  /** The total. Larger, and first. */
  emphasis?: boolean;
  /** Tints the row. For the one line that is money leaving today. */
  tinted?: boolean;
}

export function MoneyRows({ rows }: { rows: readonly MoneyRow[] }) {
  return (
    <dl className="overflow-hidden rounded-[14px] border border-line bg-surface">
      {rows.map((row, index) => (
        <div
          key={row.label}
          className={cn(
            "flex items-baseline justify-between gap-3 px-3.5",
            row.emphasis ? "py-3.5" : "py-3",
            index > 0 && "border-t border-line",
            row.tinted && "bg-warm-50",
          )}
        >
          <div className="min-w-0">
            <dt
              className={cn(
                "text-text",
                row.emphasis ? "text-[15px] font-bold" : "text-[13.5px] font-semibold",
              )}
            >
              {row.label}
            </dt>
            {row.note !== undefined ? (
              <p className="mt-0.5 text-xs leading-4 text-text-muted">{row.note}</p>
            ) : null}
          </div>
          <dd
            className={cn(
              "shrink-0 tabular-nums text-text",
              row.emphasis ? "text-xl font-bold" : "text-[15px] font-semibold",
            )}
          >
            {row.amount}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The card's loading state, at the card's own height.
 *
 * Three rows tall on purpose. A skeleton shorter than what replaces it makes the
 * page jump when the rate lands, which on a screen whose next control is a
 * payment is the moment a jump matters most.
 */
export function MoneyRowsSkeleton() {
  return (
    <div aria-busy="true" className="overflow-hidden rounded-[14px] border border-line bg-surface">
      <span className="sr-only">Working out what this costs</span>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className={cn(
            "flex items-center justify-between gap-3 px-3.5 py-3.5",
            row > 0 && "border-t border-line",
          )}
        >
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
