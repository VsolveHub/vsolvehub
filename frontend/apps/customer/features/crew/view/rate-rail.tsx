"use client";

import { Disclosure, RailHeadline, RailMoney, cn, type RailMoneyRow } from "@vsolve/ui";
import type { ReactNode } from "react";

import type { RateDisclosureView } from "../adapters";

/**
 * The published rate, beside the form that changes it — `M2-FE-426`.
 *
 * The desktop half of ADR-0009's promise. A3 exists because a remote quote
 * against a vague requirement gives the on-site renegotiation — "third floor, no
 * lift? Extra, bhaiya" — somewhere to live, and the answer is a published number
 * the Customer is holding *before* anybody commits. On a phone that number had
 * to be a second screen; here it sits next to the form and moves as the job
 * does, which is a stronger version of the same promise: the price is not
 * something you go and ask for, it is something you watch.
 *
 * ## Every figure is the server's, including when the size changed a moment ago
 *
 * Nothing here multiplies, divides or fills in a missing value. The rate, the
 * total, the wage half and the fee all arrive priced from
 * `GET .../rate-card/?headcount=&days=`, and `toRateDisclosureView` returns
 * `null` rather than a partial rate.
 *
 * That is also why `isStale` exists. Between a press of a stepper and the
 * server's answer, the figures on screen belong to the *previous* size — true
 * numbers describing a job the Customer has already stopped asking for. Blanking
 * them would make the rail flicker on every press; leaving them unmarked would
 * present one size's price as another's. So they stay, dimmed, marked
 * `aria-busy`, and the live region says the price is being worked out.
 *
 * ## What stays open, and what goes behind a chevron
 *
 * The three disclosures are explanation: what the rate covers, what the
 * published add-ons cost, how cancelling works. What does **not** collapse is
 * `M2-FE-415` — that Vsolve does not hold the wage money, and so payment,
 * refunds and any guarantee on the work are between the Customer and the crew.
 * It is a disclosure in the legal sense rather than the UI one, the Customer is
 * about to authorise a charge on the strength of it, and `Disclosure`'s own note
 * forbids hiding exactly this.
 */

export interface RateRailProps {
  /** The priced rate, or `null` while there is nothing to price. */
  rate: RateDisclosureView | null;
  /**
   * The city the card is published for, from the address the Customer chose.
   *
   * Their own answer rather than a server field — `RatePreview` publishes no
   * locality — so it is a label on the eyebrow and never part of a figure.
   */
  cityLabel: string | null;
  /** True while a newly-chosen size is being priced. See the note above. */
  isStale?: boolean;
  /**
   * What the Customer cannot do yet, in one sentence, when there is no rate.
   *
   * Supplied by the screen because the reason differs — no address, no start
   * date, or the server's own `unavailable_reason`. The rail renders it and
   * **never a zero**: a blank total reads as "not known yet", where `₹0` reads
   * as free.
   */
  placeholder?: string;
  /** The action and anything that must sit with it, such as a refusal. */
  footer?: ReactNode;
}

/** "3 people × 2 days" — the job, not a price. Counting words, not arithmetic. */
function crewLine(rate: RateDisclosureView): string {
  const people = `${rate.headcount} ${rate.headcount === 1 ? "person" : "people"}`;
  const days = `${rate.days} ${rate.days === 1 ? "day" : "days"}`;
  return `${people} × ${days}`;
}

export function RateRail({
  rate,
  cityLabel,
  isStale = false,
  placeholder,
  footer,
}: RateRailProps) {
  const rows: readonly RailMoneyRow[] =
    rate === null
      ? [
          { label: "Total", amount: null, emphasis: true },
          { label: "Cash to the crew", amount: null },
          { label: "Booking fee, to us", amount: null, tinted: true },
        ]
      : [
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
        ];

  return (
    <div className="flex flex-col gap-3">
      <RailHeadline
        eyebrow={cityLabel === null ? "Published rate" : `Published rate · ${cityLabel}`}
        // The em dash is the same "not known yet" the money rows use, for the
        // same reason: this screen never prints a price it was not given.
        value={rate?.dayRateLabel ?? "—"}
        unit="per person, per day"
        footnote={
          rate === null
            ? (placeholder ?? "We will show the rate for your area once we know where the work is.")
            : `${rate.standardDayHours}-hour shift · overtime ${rate.overtimeHourlyLabel} per hour, only if you approve it`
        }
      />

      <div
        // Dimmed and marked busy together. Either alone is a lie: dimming without
        // `aria-busy` hides the staleness from anybody not looking at it, and
        // `aria-busy` without dimming leaves a sighted reader reading the old
        // size's total as though it were the new one's.
        aria-busy={isStale || undefined}
        className={cn(
          "transition-opacity duration-fast",
          isStale && "opacity-60",
        )}
      >
        <RailMoney rows={rows} />
      </div>

      {/* One announcement per settled price, not one per digit. The rail is the
          only place the total appears on a wide screen, so a customer who cannot
          see it needs to be told when it has finished changing. */}
      <p aria-live="polite" className="sr-only">
        {isStale
          ? "Working out the new price"
          : rate === null
            ? "No price yet"
            : `${crewLine(rate)} comes to ${rate.totalLabel}. ${rate.leadReceiptLabel} cash to the crew, ${rate.bookingFeeLabel} booking fee.`}
      </p>

      {footer}

      {/* `M2-FE-415`, before the money and never behind a chevron. The two short
          lines are the headline; the sentence under them is the substance, and
          it is the part that says who is liable for the work. */}
      <div className="rounded-card border border-warning-line bg-warning-surface p-4">
        <p className="text-sm font-bold text-text">You pay the crew directly.</p>
        <p className="mt-0.5 text-sm font-semibold text-text">We never hold wage money.</p>
        <p className="mt-2 text-[0.8125rem] leading-5 text-text-secondary">
          We find you a supervisor and his team, we publish the rate, and if the
          connection fails we find you somebody else. Because we do not hold the
          wage money,{" "}
          <strong className="font-semibold text-text">
            payment for the work, any refund on it and any guarantee about it are
            between you and them
          </strong>
          . The booking fee is the only payment that comes to us.
        </p>
      </div>

      {rate !== null ? <RateDisclosures rate={rate} /> : null}
    </div>
  );
}

/**
 * The three collapsed rows under the rail.
 *
 * Explanation that is available without being in the way — the whole reason
 * `Disclosure` exists. Each summary is phrased as the question it answers, and
 * each carries a hint saying what is behind it, so a Customer can tell whether
 * it is worth opening before they open it.
 */
function RateDisclosures({ rate }: { rate: RateDisclosureView }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line bg-surface px-4 py-2">
      {rate.inclusions.length > 0 ? (
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
      ) : null}

      {rate.addOns.length > 0 ? (
        <Disclosure summary="What can change the price" hint="Published">
          <p>
            Published in advance. Anything extra goes through a change you approve
            in the app at these rates — never a number agreed at your door.
          </p>
          <dl className="mt-2 flex flex-col gap-1">
            {rate.addOns.map((addOn) => (
              <div key={addOn.code} className="flex items-baseline justify-between gap-3">
                <dt>{addOn.label}</dt>
                <dd data-numeric className="shrink-0 font-medium tabular-nums text-text">
                  +{addOn.amountLabel}
                  <span className="ml-1 font-normal text-text-muted">/ person / day</span>
                </dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      ) : null}

      <Disclosure summary="If you cancel" hint="Fee rules">
        <p>
          Cancel early and the {rate.bookingFeeLabel} comes back whole. Cancel
          late and part of it pays the supervisor for turning down other work.
          Nobody came? Full refund.
        </p>
        <p className="mt-2">
          One shift is {rate.standardDayHours} hours per person. After that,
          overtime is {rate.overtimeHourlyLabel} per person per hour — published
          in advance, and counted only once you approve it in the app.
        </p>
      </Disclosure>
    </div>
  );
}
