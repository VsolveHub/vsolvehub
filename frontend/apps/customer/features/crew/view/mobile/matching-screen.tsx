"use client";

import { Badge, Button } from "@vsolve/ui";
import type { ReactNode } from "react";

import { MobileScreen } from "@/features/booking/view/mobile-screen";
import { WaveMeter } from "@/features/booking/view/parts/wave-meter";
import type { BookingView, CascadeView } from "../../adapters";

/**
 * A3 · 3 — Finding your crew.
 *
 * The calmest screen in the app, and deliberately. A customer cannot make a
 * supervisor accept, so every control that could sit here would be one that does
 * nothing — which is why the only action is a *secondary* cancel and there is no
 * primary button at all.
 *
 * ## The meter replaces a paragraph
 *
 * "We have widened the search" is a sentence somebody has to read and then
 * believe. Four bars with the current one filled and a caption under them is the
 * same fact, checkable at a glance, and it answers the second question the
 * sentence never did: how much searching is left.
 *
 * Bar count, current wave and the count of supervisors holding an offer are all
 * the server's — see `cascade_progress`. When the cascade is not running or is
 * unconfigured, the whole block is absent rather than showing a meter for a
 * search that is not happening.
 */

export interface MatchingScreenProps {
  serviceName: string;
  booking: BookingView;
  cascade: CascadeView | null;
  /** "Kondapur — 500084", from the request. Null when it cannot be resolved. */
  addressLine: string | null;
  /** The start day, already formatted. */
  startsOn: string | null;
  /** Back to the request list. */
  onBack: () => void;
  /** Absent when the server says there is nothing cancellable. */
  onCancel?: () => void;
  isCancelling?: boolean;
  /** Where "Edit request" goes. */
  editHref: string;
  /** Refusals, rendered above the summary by the caller. */
  notice?: ReactNode;
}

export function MatchingScreen({
  serviceName,
  booking,
  cascade,
  addressLine,
  startsOn,
  onBack,
  onCancel,
  isCancelling = false,
  editHref,
  notice,
}: MatchingScreenProps) {
  return (
    <MobileScreen
      title={serviceName}
      onBack={onBack}
      badge={
        <Badge tone="info" dot>
          Live
        </Badge>
      }
      reassurance="We will text you the moment a crew is confirmed."
      action={
        onCancel === undefined ? undefined : (
          // Outline, not primary. Cancelling is not what this screen is for, and
          // a filled button is a recommendation.
          <Button
            block
            variant="outline"
            onClick={onCancel}
            disabled={isCancelling}
            className="h-[46px] rounded-[11px] text-[15px]"
          >
            Cancel this request
          </Button>
        )
      }
    >
      {notice}

      <div className="rounded-2xl bg-navy-900 p-[18px] text-text-inverse">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.09em] text-signal-500">
          <span aria-hidden className="inline-block h-[9px] w-[9px] rounded-full bg-action" />
          Finding your crew
        </p>
        <p className="mt-2 text-2xl font-bold leading-[30px]">Usually within 2 hours</p>
        <p className="mt-1.5 text-[13.5px] leading-5 text-warm-300">
          {cascade !== null && cascade.hasOffersOut
            ? `${cascade.offersOut} ${
                cascade.offersOut === 1 ? "supervisor" : "supervisors"
              } nearby ${cascade.offersOut === 1 ? "has" : "have"} it. First to accept gets the job.`
            : `We have sent this to supervisors who can field ${
                booking.headcount === 1 ? "one person" : `${booking.headcount} people`
              } at our published rate.`}
        </p>

        {cascade !== null ? (
          <div className="mt-3.5">
            <WaveMeter wave={cascade.waves.length > 0 ? currentWave(cascade) : 1} totalWaves={cascade.waves.length} />
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
        <div className="flex items-baseline justify-between gap-3 px-3.5 py-3">
          <p className="text-[13.5px] font-semibold text-text">
            {booking.headcount} {booking.headcount === 1 ? "person" : "people"} ·{" "}
            {booking.days} {booking.days === 1 ? "day" : "days"}
          </p>
          {startsOn !== null ? (
            <p className="shrink-0 text-[13px] text-text-secondary">From {startsOn}</p>
          ) : null}
        </div>

        {addressLine !== null ? (
          <div className="flex items-baseline justify-between gap-3 border-t border-line px-3.5 py-3">
            <p className="min-w-0 truncate text-[13.5px] text-text">{addressLine}</p>
            <a
              href={editHref}
              className="shrink-0 text-[13px] font-semibold text-text-link underline underline-offset-2"
            >
              Edit request
            </a>
          </div>
        ) : null}

        <div className="flex items-baseline justify-between gap-3 border-t border-line bg-warm-50 px-3.5 py-3">
          <p className="text-[13px] text-text-secondary">
            {booking.dayRateLabel} per person per day
          </p>
          <p className="shrink-0 text-[15px] font-bold tabular-nums text-text">
            {booking.totalLabel}
          </p>
        </div>
      </div>

      {/* The line that makes walking away safe, and it is never behind a
          chevron on a screen whose only button is Cancel. */}
      <div className="flex items-center gap-3 rounded-[14px] border border-warm-300 bg-warm-100 px-3.5 py-3">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-[15px] font-bold text-text"
        >
          ₹
        </span>
        <p className="text-[13px] leading-5 text-text">
          <strong className="font-bold">Nothing charged yet.</strong>{" "}
          {booking.bookingFeeLabel} when someone accepts, nothing if nobody does.
        </p>
      </div>
    </MobileScreen>
  );
}

/** The 1-based wave that is out now, read off the view's own states. */
function currentWave(cascade: CascadeView): number {
  const index = cascade.waves.findIndex((wave) => wave.state === "current");
  return index === -1 ? cascade.waves.length : index + 1;
}
