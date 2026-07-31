"use client";

import { Readout, Skeleton, formatMoney } from "@vsolve/ui";

import type { QuoteView } from "../adapters";

/**
 * The itemised price summary.
 *
 * B3 asks for this to be *stable*, which is the harder half. A summary that
 * appears at review and is blank before it is not stable — the customer watches
 * the total arrive late and cannot tell whether it changed. So the panel is
 * always present, and before a quote exists it shows the catalog's "starts at"
 * clearly labelled as a starting price rather than an empty space or a zero.
 *
 * A zero would be the worst of the three: ₹0 is a number, and a number reads as
 * a price.
 *
 * Nothing here adds anything up. Subtotal, fee, tax and total are each a `Money`
 * the server sent. If they disagree, that is a backend bug that must be visible,
 * not one the frontend papers over by recomputing the total from the lines.
 */

export interface PriceSummaryProps {
  quote: QuoteView | null;
  /** Catalog "starts at", shown until a real quote exists. */
  startingPricePaise: number | null;
  isLoading?: boolean;
}

export function PriceSummary({ quote, startingPricePaise, isLoading = false }: PriceSummaryProps) {
  if (quote === null) {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Price</h2>

        {isLoading ? (
          <div className="mt-3">
            <Skeleton className="h-12 w-full" />
          </div>
        ) : startingPricePaise !== null ? (
          <>
            <Readout
              className="mt-3"
              label="Starts at"
              value={formatMoney(startingPricePaise)}
              size="sm"
            />
            <p className="mt-3 text-sm text-text-secondary">
              Your final price depends on the work and how long it takes. You see
              the full amount before you pay.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">
            We will show your price once you have told us about the work.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-text">Price</h2>

      <dl className="mt-3 flex flex-col gap-2 text-sm">
        {quote.lines.map((line) => (
          <div key={line.code} className="flex items-baseline justify-between gap-4">
            <dt className="text-text-secondary">{line.label}</dt>
            <dd data-numeric className="shrink-0 text-text">
              {line.amountLabel}
            </dd>
          </div>
        ))}

        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-2">
          <dt className="text-text-secondary">Subtotal</dt>
          <dd data-numeric className="shrink-0 text-text">
            {quote.subtotalLabel}
          </dd>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-text-secondary">{quote.platformFeeLabel}</dt>
          <dd data-numeric className="shrink-0 text-text">
            {quote.platformFeeAmountLabel}
          </dd>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          {/* The tax label is the server's, rate included. */}
          <dt className="text-text-secondary">{quote.taxLabel}</dt>
          <dd data-numeric className="shrink-0 text-text">
            {quote.taxAmountLabel}
          </dd>
        </div>
      </dl>

      <Readout className="mt-4" label="Total" value={quote.totalLabel} size="md" />
    </div>
  );
}
