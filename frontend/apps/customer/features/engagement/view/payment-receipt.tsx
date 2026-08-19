"use client";

import { Disclosure, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { toBookingView } from "@/features/crew/adapters";
import { useRateCardState } from "@/features/crew/queries";
import { receiptHref } from "@/lib/routes";

import type { EngagementView } from "../adapters";

/**
 * What the Customer paid, in full — and the receipt for the part Vsolve took.
 *
 * ## Why the whole split is here and not just the fee
 *
 * The first version showed one number: ₹300, the booking fee, correct and
 * completely baffling. A Customer who booked three people for two days at ₹900 a
 * day looks at a screen headed *Receipt* on their ₹5,400 booking, reads ₹300,
 * and reasonably concludes something is broken.
 *
 * Nothing was broken; ₹300 is genuinely all Vsolve collected. But "correct" and
 * "understandable" are different tests, and a money screen has to pass both. So
 * the booking's whole cost is stated, split into the part paid directly to the
 * crew and the part paid to us — and the receipt is scoped, visibly, to the
 * second.
 *
 * The earlier reasoning — that crew money on a Vsolve receipt implies Vsolve
 * collected it — was right about the *document* and wrong as a reason to omit it
 * from the *page*. It is on the page, labelled as not collected by us, which is
 * the honest version of both.
 */
export function PaymentReceipt({ view }: { view: EngagementView }) {
  const receipt = view.accessReceipt;
  const rateQuery = useRateCardState(view.requirementId, view.mode === "lead_only");
  const state = rateQuery.data ?? null;
  const booking = state?.booking == null ? null : toBookingView(state.booking);

  if (receipt === null && booking === null) {
    return (
      <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
        There is no receipt on this booking yet. That is normal if nothing has
        been charged. If you have paid and it is not here, contact support with
        the date and we will find it.
      </p>
    );
  }

  return (
    <section aria-labelledby="money-heading" className="mt-3 rounded-card border border-line bg-surface">
      <div className="border-b border-line p-4">
        <h3 id="money-heading" className="font-semibold text-text">
          What this booking costs
        </h3>
      </div>

      {booking !== null ? (
        <dl className="divide-y divide-line">
          <Row
            label="The work"
            caption={`${booking.headcount === 1 ? "1 person" : `${booking.headcount} people`} × ${booking.days} ${booking.days === 1 ? "day" : "days"} at ${booking.dayRateLabel} a day`}
            value={booking.totalLabel}
            numeric
          />
          <Row
            label="Paid directly to the crew"
            caption="Cash, at the end of each day. V Solve Hub never holds this money."
            value={booking.leadReceiptLabel}
            numeric
          />
          <Row
            label="Paid to V Solve Hub"
            caption="The booking fee — the only part charged online."
            value={booking.bookingFeeLabel}
            numeric
            emphasis
          />
        </dl>
      ) : null}

      {receipt !== null ? (
        <div className="border-t border-line p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-text">
              Receipt for the {receipt.amountLabel} paid to V Solve Hub
            </p>
            <p data-numeric className="font-mono text-sm text-text-secondary">
              {receipt.number}
            </p>
          </div>
          {receipt.paidOn !== null ? (
            <p className="mt-1 text-sm text-text-secondary">Paid on {receipt.paidOn}</p>
          ) : null}

          <div className="mt-3">
            <Link
              href={receiptHref(view.engagementId)}
              className={buttonStyles({ variant: "outline", size: "sm" })}
            >
              View receipt
            </Link>
          </div>

          <div className="mt-3">
            <Disclosure summary="Is this a tax invoice?">
              No. This is a receipt for the fee you paid V Solve Hub, and the
              reference is the number to quote if you contact us about it. It is
              not a tax invoice, and it does not cover the money you pay the crew
              for the work itself — that is settled directly between you and them.
            </Disclosure>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Row({
  label,
  caption,
  value,
  numeric = false,
  emphasis = false,
}: {
  label: string;
  caption?: string;
  value: string;
  numeric?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-3">
      <div>
        <dt className={emphasis ? "font-semibold text-text" : "text-sm text-text"}>{label}</dt>
        {caption !== undefined ? (
          <p className="mt-0.5 max-w-prose text-xs leading-5 text-text-secondary">{caption}</p>
        ) : null}
      </div>
      <dd
        {...(numeric ? { "data-numeric": true } : {})}
        className={emphasis ? "text-lg font-semibold text-text" : "font-medium text-text"}
      >
        {value}
      </dd>
    </div>
  );
}
