"use client";

import { Badge } from "@vsolve/ui";

import type { AddOnRateView, RateDisclosureView } from "../adapters";

/**
 * The published rate and its inclusion list — `M2-FE-426`.
 *
 * On screen **before** anything is booked, which is the whole point of the rate
 * card: ADR-0009 exists because a remote quote against a vague requirement gives
 * the on-site renegotiation — "third floor, no lift? Extra, bhaiya" — somewhere
 * to live. A Customer holding a published number, a published shift length, a
 * published overtime rate and a published add-on list has nothing to be
 * surprised by.
 *
 * ## Every figure is the server's
 *
 * `total_customer_paise = lead_receipt_paise + booking_fee_paise`, calculated
 * server-side, so the two sentences below always add to the one number the
 * Customer agrees to. Nothing here multiplies, divides or fills in a missing
 * value; `toRateDisclosureView` returns `null` rather than a partial rate, and
 * this component is not rendered at all in that case.
 *
 * ## Two components, not three, and the third is absent on purpose
 *
 * `RateCard` carries the worker day-wage, the lead's supervision margin and the
 * platform booking fee. The **Customer's** read publishes two of them — what
 * goes to the crew and what goes to Vsolve — because the lead's own margin is
 * the lead's business, and `RatePreview` says so in as many words. So this shows
 * the split the Customer is entitled to and does not reconstruct the third from
 * the other two, which is exactly the inference the server split these fields to
 * prevent.
 *
 * ## It says what kind of booking this is, plainly
 *
 * A3 is `LEAD_ONLY`. The wage money is peer-to-peer, paid to the lead at day end
 * and **never held by Vsolve**, so service payment, service refunds and any
 * guarantee on the work are between the Customer and the vendor. `M2-FE-415`
 * forbids presenting that as a protected booking, and the disclosure is here —
 * before the money — rather than only on the engagement afterwards.
 */

export interface RateDisclosureProps {
  rate: RateDisclosureView;
  /** Rendered as the frozen terms of a booking already made, rather than an offer. */
  isBooked?: boolean;
}

export function RateDisclosure({ rate, isBooked = false }: RateDisclosureProps) {
  return (
    <section className="rounded-card border border-line bg-surface">
      <header className="border-b border-line p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-text">
            {isBooked ? "What you booked" : "What this costs"}
          </h2>
          <Badge tone="neutral">Published rate</Badge>
        </div>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          <strong className="font-semibold text-text">{rate.dayRateLabel}</strong> per
          person per {rate.standardDayHours}-hour day, all in. That is our published
          rate for this work in this city — not an estimate, and not a starting
          point somebody negotiates up on site.
        </p>
      </header>

      <dl className="divide-y divide-line">
        <Row
          term={`${rate.headcount} ${rate.headcount === 1 ? "person" : "people"} for ${rate.days} ${
            rate.days === 1 ? "day" : "days"
          }`}
          value={rate.totalLabel}
          emphasis
        />
        <Row
          term="Paid to the crew, directly, at the end of each day"
          value={rate.leadReceiptLabel}
          note="Vsolve never holds this money. You pay the supervisor and he pays his people."
        />
        <Row
          term="Booking fee, paid to Vsolve now"
          value={rate.bookingFeeLabel}
          note="The only money we collect on this booking, and it is charged only once a crew has accepted."
        />
      </dl>

      <div className="border-t border-line p-4">
        <h3 className="text-sm font-semibold text-text">What counts as a day</h3>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          One shift of {rate.standardDayHours} hours per person. After that,
          overtime is{" "}
          <strong className="font-semibold text-text">
            {rate.overtimeHourlyLabel} per person per hour
          </strong>{" "}
          — published in advance, and it counts only after you approve it in the
          app.
        </p>
      </div>

      {rate.inclusions.length > 0 ? (
        <div className="border-t border-line p-4">
          <h3 className="text-sm font-semibold text-text">What this includes</h3>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-text-secondary">
            {rate.inclusions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {rate.addOns.length > 0 ? <AddOnTable addOns={rate.addOns} /> : null}

      {/* `M2-FE-415`, said before the money rather than after it. */}
      <div className="border-t border-warning-line bg-warning-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-semibold text-text">You pay the crew directly</h3>
          <Badge tone="warning">Not a Vsolve booking</Badge>
        </div>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text">
          We find you a supervisor and his team, we publish the rate, and we help
          if the connection fails — we will find you somebody else. We do{" "}
          <strong className="font-semibold">not</strong> hold the wage money, so{" "}
          <strong className="font-semibold">
            payment for the work, any refund on it and any guarantee about it are
            between you and them
          </strong>
          . The booking fee above is the only payment that comes to us.
        </p>
      </div>
    </section>
  );
}

/**
 * The published add-on rates.
 *
 * These are the price-moving facts, priced in advance rather than argued about
 * on site. The labels are derived from the server's own keys — see
 * `humaniseAddOnCode` — because the card publishes no display names and a
 * hardcoded dictionary here would go stale the first time Operations adds a row.
 */
function AddOnTable({ addOns }: { addOns: readonly AddOnRateView[] }) {
  return (
    <div className="border-t border-line p-4">
      <h3 className="text-sm font-semibold text-text">
        What changes the price, and by how much
      </h3>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Published in advance. Anything extra goes through a change you approve in
        the app at these rates — never a number agreed at your door.
      </p>
      <dl className="mt-3 divide-y divide-line rounded-card border border-line">
        {addOns.map((addOn) => (
          <div
            key={addOn.code}
            className="flex items-baseline justify-between gap-3 px-3 py-2"
          >
            <dt className="text-sm text-text-secondary">{addOn.label}</dt>
            <dd data-numeric className="text-sm font-medium text-text">
              {addOn.amountLabel}
              <span className="ml-1 text-text-muted">per person per day</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Row({
  term,
  value,
  note,
  emphasis = false,
}: {
  term: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <dt className={emphasis ? "font-semibold text-text" : "text-sm text-text-secondary"}>
          {term}
        </dt>
        <dd
          data-numeric
          className={emphasis ? "text-lg font-semibold text-text" : "font-medium text-text"}
        >
          {value}
        </dd>
      </div>
      {note !== undefined ? (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-muted">{note}</p>
      ) : null}
    </div>
  );
}
