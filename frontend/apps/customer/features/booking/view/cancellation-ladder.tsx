"use client";

import { Badge } from "@vsolve/ui";

import type { CancellationBandView } from "../adapters";

/**
 * The graduated cancellation ladder, shown **before** the pay action.
 *
 * F2 requires concrete rupee amounts for this booking, disclosed before the
 * Partner search and before money is taken. A fee schedule revealed only
 * afterwards is a dark pattern and is not acceptable.
 *
 * It appears on review rather than only on the payment screen, because review is
 * where the customer decides. The payment stage shows it again; showing it twice
 * is the correct amount.
 *
 * Every band is rendered exactly as it arrives, including its `condition_text`.
 * The component does not know how many bands there are or what they say, and
 * that is deliberate: hardcoding the M1 ladder would put the policy in two
 * places, and the copy in the frontend would be the one that goes stale.
 */

export interface CancellationLadderProps {
  bands: CancellationBandView[];
  policyVersion: string;
  /** Server-published. See `QuoteView.rescheduleFreeNoticeHours`. */
  rescheduleFreeNoticeHours: number;
}

export function CancellationLadder({
  bands,
  policyVersion,
  rescheduleFreeNoticeHours,
}: CancellationLadderProps) {
  if (bands.length === 0) return null;

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-text">If you cancel</h3>
      <p className="mt-1 text-sm text-text-secondary">
        These amounts are for this booking. Changing the time is free up to{" "}
        {rescheduleFreeNoticeHours} hours before we arrive — you only pay a fee if you cancel.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {bands.map((band) => (
          <li
            key={band.code}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2 last:border-0 last:pb-0"
          >
            <span className="min-w-0 flex-1 text-sm text-text-secondary">
              {band.conditionText}
            </span>

            <span className="flex shrink-0 items-center gap-2">
              {band.isFree ? (
                <Badge tone="success">Free</Badge>
              ) : (
                <Badge tone="neutral">
                  <span data-numeric>{band.feeLabel}</span> fee
                </Badge>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-text-muted">Policy {policyVersion}</p>
    </section>
  );
}
