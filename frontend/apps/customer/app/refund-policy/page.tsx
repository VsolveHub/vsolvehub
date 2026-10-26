import type { Metadata } from "next";
import Link from "next/link";
import { formatMoney } from "@vsolve/ui";

import { LegalDocument, type LegalSection } from "@/features/legal/legal-document";
import { getPublishedCancellationPolicy } from "@/features/legal/queries";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";
import { SUPPORT } from "@/lib/support";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description:
    "When you are charged, what cancelling costs, and how refunds reach you — for home visits, projects, crews, rentals and stays booked on V Solve Hub.",
  alternates: { canonical: "/refund-policy" },
};

// The fee table is read live, so the page refreshes with it.
export const revalidate = 300;

const UPDATED = "26 October 2026";

/**
 * Refund & Cancellation Policy.
 *
 * Every rule here is the one the platform enforces, not a promise beside it: the visit fee table
 * comes from the same policy the checkout freezes onto a quote, and the other sections describe
 * what the cancellation services actually do for each kind of booking.
 */
export default async function RefundPolicyPage() {
  const policy = await getPublishedCancellationPolicy();
  const sampleReceiptUrl = `${PUBLIC_API_BASE_URL}/api/v1/legal/sample-receipt/`;

  const sections: LegalSection[] = [
    {
      id: "when-charged",
      title: "When you are charged",
      body: (
        <>
          <p>
            Booking is free until a professional commits. Checking out sends your request to
            verified professionals; <strong>you pay only once a professional has accepted every
            visit in your booking</strong>. If nobody accepts, you are not charged anything.
          </p>
          <p>
            If a visit cannot go ahead after you have paid — for example the slot you paid for can
            no longer be confirmed — the full amount is refunded automatically. You do not need to
            ask.
          </p>
          <p>
            Every price is shown before you pay, including the platform fee. Extra work is only
            added with your approval in the app, at the published rate.
          </p>
        </>
      ),
    },
    {
      id: "home-visits",
      title: "Home visits (fixed-price services)",
      body: (
        <>
          <p>
            You can cancel a visit from your booking in the app. The fee depends on how close to
            the start of your arrival window you cancel. The confirm step always shows the exact
            fee and the amount you will get back <strong>before</strong> you confirm.
          </p>
          {policy ? (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[22rem] text-left text-sm">
                <caption className="sr-only">Cancellation fees for home visits</caption>
                <thead className="bg-surface-sunken text-xs font-bold text-navy-900 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      When you cancel
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Cancellation fee
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {policy.bands.map((band) => (
                    <tr key={band.code} className="border-t border-line">
                      <td className="px-4 py-3 text-text">{band.condition_text}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-navy-900 tabular-nums">
                        {band.fee.amount_paise === 0 ? "Free" : formatMoney(band.fee.amount_paise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-xl border border-line bg-surface-sunken p-4">
              We could not load the current fee table just now. The exact fee for your visit is
              always shown before you confirm a cancellation, and you can ask us at{" "}
              <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>.
            </p>
          )}
          <ul>
            <li>
              <strong>Refund amount:</strong> what you paid for the visit, minus the fee above.
            </li>
            <li>
              <strong>No fee when the problem is ours:</strong> if the professional cancels or
              releases your visit, or arrives materially late, you pay no cancellation fee at all.
            </li>
            {policy ? (
              <li>
                <strong>Rescheduling is free</strong> up to {policy.reschedule_free_notice_hours}{" "}
                hours before your visit.
              </li>
            ) : null}
            <li>
              <strong>Once work has started</strong> a visit can no longer be cancelled. You pay
              only for the work that was actually completed, item by item.
            </li>
            <li>
              Your booking keeps the fee table that applied when you booked, even if this page
              changes later.
            </li>
          </ul>
          <h3>If something is wrong with the work</h3>
          <p>
            Report it from your booking or through{" "}
            <Link href="/contact">Contact us</Link>
            {policy ? ` within ${policy.quality_dispute_window_hours} hours of the visit being completed` : ""}
            . We review every report and, depending on what we find, arrange a revisit or refund
            the affected part of the job.
          </p>
        </>
      ),
    },
    {
      id: "projects",
      title: "Custom projects (visit plans and stages)",
      body: (
        <>
          <ul>
            <li>
              Posting your requirement is free. The <strong>visit plan</strong> you choose is
              charged once, when the first professional confirms a visit slot. If no professional
              ever confirms, nothing is charged.
            </li>
            <li>
              Visit slots that are not filled in time, and visits where the professional does not
              turn up, are refunded automatically for that slot.
            </li>
            <li>
              If you cancel, the part of your visit plan that has not been used is refunded.
              Visits that already took place are not.
            </li>
            <li>
              Project <strong>stages</strong> are paid before each stage starts. If the project is
              cancelled, money for stages that were not delivered is returned to you. Any advance
              already handed over for materials bought for your job is settled separately, and the
              amount is shown before you confirm.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "crew",
      title: "Crew and day hire",
      body: (
        <>
          <ul>
            <li>
              A <strong>booking fee</strong> is charged when the crew lead accepts your booking.
              Cancelling before the free-cancellation cut-off shown when you book refunds the fee
              in full.
            </li>
            <li>
              If you cancel after the cut-off, or the crew arrives and cannot work (no one present,
              site locked), the booking fee is not refunded: part of it pays the crew for their
              travel.
            </li>
            <li>
              If the crew does not turn up, the booking fee is refunded in full and we find you
              another crew at no extra cost.
            </li>
            <li>
              <strong>Daily wages are paid by you directly to the crew lead</strong> at the end of
              each day. V Solve Hub never holds wage money, so it cannot refund it. If fewer
              workers turn up than you booked, you can cancel the shortfall free of charge.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "quotes",
      title: "Quote unlock",
      body: (
        <p>
          When a service works on quotes, the quote unlock fee is charged only once at least one
          usable quote is ready for you. It is refunded if the quotes become unavailable before you
          can read them. Once you have unlocked and can read the quotes, the fee is not refundable.
        </p>
      ),
    },
    {
      id: "rentals-stays",
      title: "Rentals and stays",
      body: (
        <ul>
          <li>
            <strong>Rentals:</strong> cancel before the item is handed over and you get a full
            refund. A security deposit, where one applies, is returned after the item comes back
            in the agreed condition.
          </li>
          <li>
            <strong>Stays:</strong> sending an enquiry is free. A paid reservation cancelled before
            check-in is refunded in full.
          </li>
        </ul>
      ),
    },
    {
      id: "how-refunds-reach-you",
      title: "How refunds reach you",
      body: (
        <>
          <ul>
            <li>
              Refunds go back to the <strong>original payment method</strong> through our payment
              partner, Razorpay. Any part you paid from your V Solve Hub wallet goes back to the
              wallet.
            </li>
            <li>
              We start the refund as soon as it is due. Banks usually take{" "}
              <strong>5–7 working days</strong> to show it in your account, sometimes longer for
              cards.
            </li>
            <li>
              Every refund is listed on your booking, and a credit note is issued against your
              receipt. You can see what a receipt looks like in our{" "}
              <a href={sampleReceiptUrl} target="_blank" rel="noreferrer">
                sample receipt
              </a>
              .
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "help",
      title: "How to cancel or ask about a refund",
      body: (
        <p>
          Cancel from your booking in the app — it shows the exact fee and refund first. For
          anything else, contact us at <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>
          {SUPPORT.phone ? (
            <>
              , call or WhatsApp <a href={SUPPORT.phone.telHref}>{SUPPORT.phone.display}</a> (
              {SUPPORT.phoneHours})
            </>
          ) : null}
          , or use the <Link href="/contact">contact form</Link>. We reply {SUPPORT.replyTime}.
        </p>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Refund & Cancellation Policy"
      updated={UPDATED}
      intro={
        <>
          <p>
            This policy explains when you pay, what cancelling costs, and how refunds reach you
            for every kind of booking on V Solve Hub. It forms part of our{" "}
            <Link href="/terms">Terms of Service</Link>.
          </p>
          <p>
            In short: you are only charged once a professional commits, problems on our side cost
            you nothing, and the app always shows the exact fee and refund before you confirm a
            cancellation.
          </p>
        </>
      }
      sections={sections}
    />
  );
}
