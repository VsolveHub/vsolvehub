"use client";

import { Sheet } from "@vsolve/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import type { AddOnRateView, RateTermsView } from "../adapters";
import { WageLine } from "./wage-line";

/**
 * The one rate & terms sheet — screen 11.
 *
 * Every screen on the A3 path used to carry its own paragraph explaining the
 * day rate, what a day covers, the overtime rule, the add-on prices, the
 * booking-fee refund rule and the cancellation window — six explanations,
 * six wordings, on `rate-disclosure.tsx`, `rate-rail.tsx` and the mobile rate
 * screen. This is the one place that explanation lives now. Every other
 * screen renders `RateTermsLink` and opens this.
 *
 * `terms` comes from `toRateTermsView`, which reads either the pre-booking
 * preview/booking or the post-booking engagement terms — the sheet itself
 * does not know or care which record it came from.
 */

export interface RateTermsSheetProps {
  terms: RateTermsView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RateTermsSheet({ terms, open, onOpenChange }: RateTermsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Rate & terms">
      <div className="flex flex-col gap-4 pb-2">
        <Row
          term={`${terms.dayRateLabel} per person per day`}
          detail="Our published rate for this work in this city — not a starting point negotiated on site."
        />

        {terms.standardDayHours !== null ? (
          <Row
            term={`${terms.standardDayHours}-hour day`}
            detail={
              terms.overtimeHourlyLabel === null
                ? "What counts as one shift."
                : `After that, overtime is ${terms.overtimeHourlyLabel} per person per hour — only once you approve it in the app.`
            }
          />
        ) : null}

        {terms.inclusions.length > 0 ? (
          <Row term="Included">
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
              {terms.inclusions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Row>
        ) : null}

        {terms.addOns.length > 0 ? (
          <Row term="Add-ons, published in advance">
            <AddOnList addOns={terms.addOns} />
          </Row>
        ) : null}

        <Row
          term={`${terms.bookingFeeLabel} booking fee`}
          detail="Now, on UPI, to Vsolve. Refunded if nobody arrives; part of it is kept only if you cancel inside the free window."
        />

        <Row
          term={`${terms.leadDayReceiptLabel} a day to the crew`}
          detail="Paid by you directly, each evening — never a number agreed at your door."
        />

        <WageLine />
      </div>
    </Sheet>
  );
}

function Row({
  term,
  detail,
  children,
}: {
  term: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-text">{term}</p>
      {detail !== undefined ? (
        <p className="mt-0.5 text-sm leading-6 text-text-secondary">{detail}</p>
      ) : null}
      {children}
    </div>
  );
}

function AddOnList({ addOns }: { addOns: readonly AddOnRateView[] }) {
  return (
    <dl className="mt-1 flex flex-col gap-1">
      {addOns.map((addOn) => (
        <div key={addOn.code} className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-text-secondary">{addOn.label}</dt>
          <dd data-numeric className="shrink-0 text-sm font-medium text-text">
            {addOn.amountLabel}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The ⓘ link that opens the sheet — self-contained, so every screen mounts
 * one line rather than a button plus a sheet plus a piece of local state.
 *
 * A button rather than a link: it opens the sheet, not a route.
 */
export function RateTermsLink({ terms }: { terms: RateTermsView }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-sm font-medium text-text-link"
      >
        <span aria-hidden>ⓘ</span> Rate & terms
      </button>
      <RateTermsSheet terms={terms} open={open} onOpenChange={setOpen} />
    </>
  );
}
