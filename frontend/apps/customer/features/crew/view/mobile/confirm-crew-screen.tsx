"use client";

import { Badge, Button, Disclosure } from "@vsolve/ui";
import type { ReactNode } from "react";

import { MobileScreen } from "@/features/booking/view/mobile-screen";
import type { BookingView } from "../../adapters";

/**
 * A3 · 4 — Confirm your crew.
 *
 * ## The supervisor is not named here, and that is not a gap in this screen
 *
 * The design shows a name, an avatar, a helper count and an ID-verified flag
 * before payment. The server publishes none of it at this moment and does so
 * deliberately: `confirmed_partner_name` is null at every status but `CONFIRMED`,
 * because vendor identity is released by the **confirmation** rather than by the
 * hold — otherwise anybody who reached this screen and never paid would collect
 * the identities of the leads who accepted.
 *
 * So the accepted panel says a supervisor took it, and says when the name
 * arrives. `A3 · 5` names them, where the server does publish it.
 *
 * ## The countdown is in the header
 *
 * Never beside the amount. A timer next to a price competes with it, and the
 * price is the thing being decided. It is also driven off the server clock
 * rather than the device's — a phone ten minutes fast would show a lapsed hold
 * and make somebody abandon a booking that was still theirs.
 *
 * ## The pay strip is inside the money card
 *
 * Bottom row, no radius break, navy. It is the visual anchor of the screen
 * because it is the only number the customer is being asked to act on now; the
 * ₹5,400 above it is context.
 */

export interface ConfirmCrewScreenProps {
  booking: BookingView;
  /** The supervisor's name once the server publishes it. Null while only held. */
  crewName: string | null;
  /** The hold's remaining time, already formatted. Null once lapsed. */
  holdRemaining: string | null;
  /** The spoken form of the same, so the digits are not announced every second. */
  holdAnnouncement: string | null;
  /** The dates being confirmed, already formatted. */
  dateRange: string | null;
  onBack: () => void;
  onPay: () => void;
  /** Absent when the server says there is nothing chargeable right now. */
  canPay: boolean;
  isPaying: boolean;
  /** What to say instead of the action, when there is nothing to press. */
  status?: ReactNode;
  notice?: ReactNode;
}

export function ConfirmCrewScreen({
  booking,
  crewName,
  holdRemaining,
  holdAnnouncement,
  dateRange,
  onBack,
  onPay,
  canPay,
  isPaying,
  status,
  notice,
}: ConfirmCrewScreenProps) {
  return (
    <MobileScreen
      title="Confirm your crew"
      onBack={onBack}
      badge={
        holdRemaining === null ? undefined : (
          <Badge tone="warning">
            <span aria-label={holdAnnouncement ?? undefined}>{holdRemaining} left</span>
          </Badge>
        )
      }
      reassurance={canPay ? "UPI, card or netbanking" : undefined}
      reassurancePosition="below"
      action={
        canPay ? (
          <Button
            block
            onClick={onPay}
            loading={isPaying}
            loadingLabel="Starting your payment"
            className="h-[50px] rounded-[11px] text-[15px]"
          >
            Pay {booking.bookingFeeLabel} and confirm
          </Button>
        ) : undefined
      }
    >
      {notice}

      <div className="rounded-2xl border border-success-line bg-success-surface p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-success-text">
          Accepted · holding for you
        </p>
        <p className="mt-1.5 text-[17px] font-bold text-text">
          {crewName ?? "A supervisor accepted your job"}
        </p>
        <p className="mt-1 text-[13px] leading-5 text-text-secondary">
          They have taken it at our published rate and are holding{" "}
          {booking.headcount === 1 ? "one person" : `${booking.headcount} people`} for
          your dates.
          {crewName === null
            ? " We introduce them by name the moment the booking is confirmed."
            : ""}
        </p>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
        <div className="flex items-baseline justify-between gap-3 px-3.5 py-3.5">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-text">
              {booking.headcount} {booking.headcount === 1 ? "person" : "people"} ×{" "}
              {booking.days} {booking.days === 1 ? "day" : "days"}
            </p>
            {dateRange !== null ? (
              <p className="mt-0.5 text-xs leading-4 text-text-muted">{dateRange}</p>
            ) : null}
          </div>
          <p className="shrink-0 text-xl font-bold tabular-nums text-text">
            {booking.totalLabel}
          </p>
        </div>

        <div className="flex items-baseline justify-between gap-3 border-t border-line px-3.5 py-3">
          <p className="text-[13.5px] font-semibold text-text">Cash to the crew, at day end</p>
          <p className="shrink-0 text-[15px] font-semibold tabular-nums text-text">
            {booking.leadReceiptLabel}
          </p>
        </div>

        {/* The anchor. Inside the card, bottom row, no radius break — so it reads
            as the conclusion of the money above it rather than a second card. */}
        <div className="flex items-baseline justify-between gap-3 bg-navy-900 px-3.5 py-[15px] text-text-inverse">
          <p className="text-sm font-bold">Pay now to confirm</p>
          <p className="shrink-0 text-[22px] font-extrabold tabular-nums">
            {booking.bookingFeeLabel}
          </p>
        </div>
      </div>

      {status}

      {canPay ? (
        <p className="text-[13px] leading-5 text-text-secondary">
          Leave this and the hold lapses — we keep looking, and nothing is charged
          either way.
        </p>
      ) : null}

      <Disclosure summary={`What the ${booking.bookingFeeLabel} is for`} hint="Fee rules">
        <p>
          It holds this crew for your dates and is the only money we collect on
          this job. Refunded in full if nobody arrives.
        </p>
      </Disclosure>
    </MobileScreen>
  );
}
