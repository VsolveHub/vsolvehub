import type { Schemas } from "@vsolve/api-client";
import { formatMoney } from "@vsolve/ui";

/**
 * The quote becomes a list of labelled amounts and a cancellation ladder.
 *
 * Nothing here computes a number. Every figure is formatted from a `Money` the
 * server sent, including the total — deriving it from the lines would produce a
 * price the server never quoted, which is the failure mode B3's "UI never
 * fabricates price" criterion names.
 */

export interface QuoteLineView {
  code: string;
  label: string;
  amountLabel: string;
}

export interface CancellationBandView {
  code: string;
  conditionText: string;
  feeLabel: string;
  /** True when cancelling costs nothing — lets the view mark it plainly. */
  isFree: boolean;
}

/** Whether the tax is already inside the total, so the summary cannot double it. */
export interface QuoteTaxView {
  label: string;
  amountLabel: string;
  isIncludedInTotal: boolean;
}

export interface QuoteView {
  id: string;
  version: number;
  expiresAt: string;
  serverNow: string;
  /** The window this price is for. A quote is never valid for another one. */
  arrivalWindowId: string;
  /** Capacity estimate shown as a readout. Never a price input (ADR-008). */
  estimatedDurationMinutes: number;
  lines: QuoteLineView[];
  subtotalLabel: string;
  platformFeeLabel: string;
  platformFeeAmountLabel: string;
  taxLabel: string;
  taxAmountLabel: string;
  /** Published in 1.6.0. A summary that adds an included tax overstates the bill. */
  taxIsIncludedInTotal: boolean;
  totalLabel: string;
  /** Raw paise, for the pay action. Never used for display arithmetic. */
  totalPaise: number;
  cancellationBands: CancellationBandView[];
  /** "a1-standard v3" — identifies the exact terms this price was quoted under. */
  cancellationPolicyVersion: string;
}

export function toQuoteView(quote: Schemas["Quote"]): QuoteView {
  return {
    id: quote.id,
    version: quote.version,
    expiresAt: quote.expires_at,
    serverNow: quote.server_now,
    arrivalWindowId: quote.arrival_window.id,
    estimatedDurationMinutes: quote.estimated_duration_minutes,
    lines: quote.lines.map((line) => ({
      code: line.code,
      label: line.label,
      amountLabel: formatMoney(line.amount.amount_paise),
    })),
    subtotalLabel: formatMoney(quote.subtotal.amount_paise),
    platformFeeLabel: quote.platform_fee.label,
    platformFeeAmountLabel: formatMoney(quote.platform_fee.amount.amount_paise),
    // The tax label carries its own rate because GST applicability varies; the
    // frontend must not assert one.
    taxLabel: quote.tax.label,
    taxAmountLabel: formatMoney(quote.tax.amount.amount_paise),
    taxIsIncludedInTotal: quote.tax.included_in_total,
    totalLabel: formatMoney(quote.total.amount_paise),
    totalPaise: quote.total.amount_paise,
    cancellationBands: quote.cancellation_policy.bands.map((band) => ({
      code: band.code,
      conditionText: band.condition_text,
      feeLabel: formatMoney(band.fee.amount_paise),
      isFree: band.fee.amount_paise === 0,
    })),
    cancellationPolicyVersion: `${quote.cancellation_policy.code} v${quote.cancellation_policy.version}`,
  };
}
