"use client";

import { Button } from "@vsolve/ui";
import type { ReactNode } from "react";

import { MobileScreen } from "@/features/booking/view/mobile-screen";
import { toRateTermsView, type RateDisclosureView } from "../../adapters";
import { RateTermsLink } from "../rate-terms-sheet";

/**
 * A3 · 13 — Our rate for this.
 *
 * Step three of three, trimmed to what a Customer decides on: the day rate,
 * the total, the two money lines, and one link to everything else. The full
 * explanation — inclusions, overtime, add-ons, the cancellation window, the
 * wage-money promise — lives in `RateTermsSheet` now, not repeated here.
 *
 * `rate` is either a fully priced view or `null`, and `null` renders nothing
 * rather than a panel with a blank number: a labelled row reading "—" looks
 * like a priced booking that came to nothing.
 */

export interface RateScreenProps {
  /** The priced rate, or null while it is being worked out. */
  rate: RateDisclosureView | null;
  /** True while a re-price is in flight for a size that just changed. */
  isStale?: boolean;
  onBack: () => void;
  onBook: () => void;
  isBooking: boolean;
  /** Refusals and the duplicate warning, rendered above the fold by the caller. */
  notice?: ReactNode;
  /** Rendered in place of everything when there is no rate to show at all. */
  unavailable?: ReactNode;
  /** What is being priced — the event card — between the rate and the money. */
  summary?: ReactNode;
}

export function RateScreen({
  rate,
  isStale = false,
  onBack,
  onBook,
  isBooking,
  notice,
  unavailable,
  summary,
}: RateScreenProps) {
  return (
    <MobileScreen
      title="Our rate for this"
      onBack={onBack}
      step="Step 3 of 3"
      action={
        unavailable === undefined && rate !== null ? (
          <Button
            block
            onClick={onBook}
            loading={isBooking}
            loadingLabel="Booking your crew"
            className="h-[50px] rounded-[11px] text-[15px]"
          >
            Book — pay {rate.bookingFeeLabel} when accepted
          </Button>
        ) : undefined
      }
    >
      <div className="crew-stage-enter flex flex-col gap-3">
        {notice}

        {unavailable !== undefined ? (
          unavailable
        ) : rate === null ? null : (
          <div className="flex flex-col gap-3" aria-busy={isStale || undefined}>
            {summary}

            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-text">
                {rate.dayRateLabel} a day to the crew
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {rate.bookingFeeLabel} booking fee when a supervisor accepts
              </p>
            </div>

            <RateTermsLink terms={toRateTermsView(rate)} />
          </div>
        )}
      </div>
    </MobileScreen>
  );
}
