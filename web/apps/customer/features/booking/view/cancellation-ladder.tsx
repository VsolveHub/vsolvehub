"use client";

import { Badge } from "@vsolve/ui";

import type { CancellationBandView } from "../adapters";

/**
 * The graduated cancellation ladder, shown **before** the pay action.
 *
 * Doc 11 §5 and B5's acceptance criterion both require this: concrete rupee
 * amounts for this booking, disclosed before money is taken. A fee schedule
 * revealed only afterwards is named in doc 11 §2.2 as a dark pattern and is not
 * acceptable.
 *
 * It appears on review — this stage — rather than only on the payment screen,
 * because review is where the customer decides. B5 shows it again at the pay
 * action; showing it twice is the correct amount.
 *
 * Every band is rendered exactly as it arrives. The component does not know
 * whether it is showing the three Scheduled bands or the five Instant ones, and
 * that is deliberate: hardcoding either set would put the policy in two places,
 * and the copy in the frontend would be the one that goes stale.
 */

export interface CancellationLadderProps {
  bands: CancellationBandView[];
  policyVersion: string;
}

export function CancellationLadder({ bands, policyVersion }: CancellationLadderProps) {
  if (bands.length === 0) return null;

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-text">If you cancel</h3>
      <p className="mt-1 text-sm text-text-secondary">
        These amounts are for this booking.
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
              <span data-numeric className="text-sm font-semibold text-text">
                {band.refundLabel} back
              </span>
              {band.isFullRefund ? (
                <Badge tone="success">No fee</Badge>
              ) : (
                <Badge tone="neutral">{band.feeLabel} fee</Badge>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-text-muted">Policy {policyVersion}</p>
    </section>
  );
}
