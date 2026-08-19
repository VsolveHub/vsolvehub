"use client";

import { Button, Disclosure } from "@vsolve/ui";
import type { ReactNode } from "react";

import { MobileScreen } from "@/features/booking/view/mobile-screen";
import { MoneyRows, MoneyRowsSkeleton } from "@/features/booking/view/parts/money-rows";
import { RatePanel, RatePanelSkeleton } from "@/features/booking/view/parts/rate-panel";
import type { RateDisclosureView } from "../../adapters";

/**
 * A3 · 2 — Our rate for this.
 *
 * Step two of two: the published number, what it comes to, and the one promise
 * that has to be read before the booking control.
 *
 * ## Every figure is the server's, and the screen has no state without them
 *
 * `rate` is either a fully priced view or `null`, and `null` renders skeletons
 * rather than a rate panel with a blank number and three rows of em-dashes. That
 * was the shipped behaviour and it is the defect this screen exists to remove:
 * a labelled row reading "—" looks like a priced booking that came to nothing.
 *
 * ## The liability paragraph is two sentences here, not six
 *
 * `M2-FE-415` — that Vsolve does not hold the wage money, so payment, refunds
 * and any guarantee on the work sit between the customer and the crew — has to
 * be **on the screen** and not behind a chevron. It is a disclosure in the legal
 * sense, and the customer is about to authorise a charge on the strength of it.
 *
 * What it does not have to be is six paragraphs above the fold. The promise is
 * stated in two sentences inline; the full terms, the inclusion list and the
 * cancellation rules are the three disclosures below, which is where explanation
 * belongs and where somebody looking for it will open it.
 */

export interface RateScreenProps {
  /** The priced rate, or null while it is being worked out. */
  rate: RateDisclosureView | null;
  /** The city the card is published for, from the chosen address. */
  city: string | null;
  /** True while a re-price is in flight for a size that just changed. */
  isStale?: boolean;
  onBack: () => void;
  onBook: () => void;
  isBooking: boolean;
  /** Refusals and the duplicate warning, rendered above the fold by the caller. */
  notice?: ReactNode;
  /** Rendered in place of everything when there is no rate to show at all. */
  unavailable?: ReactNode;
}

/** "3 people × 2 days" — counting words, not arithmetic. */
function crewLine(rate: RateDisclosureView): string {
  const people = `${rate.headcount} ${rate.headcount === 1 ? "person" : "people"}`;
  const days = `${rate.days} ${rate.days === 1 ? "day" : "days"}`;
  return `${people} × ${days}`;
}

export function RateScreen({
  rate,
  city,
  isStale = false,
  onBack,
  onBook,
  isBooking,
  notice,
  unavailable,
}: RateScreenProps) {
  return (
    <MobileScreen
      title="Our rate for this"
      onBack={onBack}
      step="Step 2 of 2"
      reassurance={
        rate === null
          ? undefined
          : `You pay ${rate.bookingFeeLabel} only when a supervisor accepts.`
      }
      action={
        unavailable === undefined && rate !== null ? (
          <Button
            block
            onClick={onBook}
            loading={isBooking}
            loadingLabel="Booking your crew"
            className="h-[50px] rounded-[11px] text-[15px]"
          >
            Book this crew
          </Button>
        ) : undefined
      }
    >
      {notice}

      {unavailable !== undefined ? (
        unavailable
      ) : (
        <div className="flex flex-col gap-3" aria-busy={isStale || undefined}>
          {rate === null ? (
            <>
              <RatePanelSkeleton />
              <MoneyRowsSkeleton />
            </>
          ) : (
            <>
              <RatePanel
                city={city}
                dayRateLabel={rate.dayRateLabel}
                standardDayHours={rate.standardDayHours}
                overtimeHourlyLabel={rate.overtimeHourlyLabel}
              />

              <MoneyRows
                rows={[
                  { label: crewLine(rate), amount: rate.totalLabel, emphasis: true },
                  {
                    label: "Cash to the crew",
                    note: `${rate.leadDayReceiptLabel} at the end of each day`,
                    amount: rate.leadReceiptLabel,
                  },
                  {
                    label: "Booking fee, to us",
                    note: "Charged only when a crew accepts",
                    amount: rate.bookingFeeLabel,
                    tinted: true,
                  },
                ]}
              />

              <ThePromise />

              <RateDisclosures rate={rate} />
            </>
          )}
        </div>
      )}
    </MobileScreen>
  );
}

/**
 * `M2-FE-415`, at phone length.
 *
 * One row, one icon, two sentences. The long form lives in *If you cancel* and
 * in the engagement's own terms — but the fact that this platform does not hold
 * the wage money is never one of the things behind a chevron.
 */
function ThePromise() {
  return (
    <div className="flex items-start gap-2.5 rounded-[14px] border border-warning-line bg-warning-surface px-3.5 py-[13px]">
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 h-[17px] w-[17px] shrink-0 text-warning-text"
      >
        <path d="M10 2.5 4 5v4.5c0 3.4 2.5 6.5 6 8 3.5-1.5 6-4.6 6-8V5l-6-2.5Z" />
      </svg>
      <p className="text-[13px] leading-5 text-text">
        <strong className="font-bold">You pay the crew directly.</strong> We never
        hold wage money, so the work itself is between you and them.
      </p>
    </div>
  );
}

/** The three collapsed rows, in one card with a hairline between each. */
function RateDisclosures({ rate }: { rate: RateDisclosureView }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
      {rate.inclusions.length > 0 ? (
        <div className="px-3.5 py-1">
          <Disclosure
            summary="What the rate includes"
            hint={`${rate.inclusions.length} ${rate.inclusions.length === 1 ? "thing" : "things"}`}
          >
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {rate.inclusions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Disclosure>
        </div>
      ) : null}

      {rate.addOns.length > 0 ? (
        <div className="border-t border-line px-3.5 py-1">
          <Disclosure summary="What can change the price" hint="Published">
            <dl className="flex flex-col gap-1.5">
              {rate.addOns.map((addOn) => (
                <div key={addOn.code} className="flex items-baseline justify-between gap-3">
                  <dt>{addOn.label}</dt>
                  <dd className="shrink-0 font-medium tabular-nums text-text">
                    +{addOn.amountLabel}
                    <span className="ml-1 font-normal text-text-muted">/ person / day</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-text-muted">
              Anything extra is a change you approve in the app, at these rates.
            </p>
          </Disclosure>
        </div>
      ) : null}

      <div className="border-t border-line px-3.5 py-1">
        <Disclosure summary="If you cancel" hint="Fee rules">
          <p>
            Cancel early and the {rate.bookingFeeLabel} comes back whole. Cancel
            late and part of it pays the supervisor for turning down other work.
            Nobody came? Full refund.
          </p>
        </Disclosure>
      </div>
    </div>
  );
}
