"use client";

import { Badge, Button, cn } from "@vsolve/ui";
import type { ReactNode } from "react";

import { MobileScreen, ScreenHeading } from "@/features/booking/view/mobile-screen";
import type { BookingView } from "../../adapters";

/**
 * A3 · edge — No crew took this yet.
 *
 * The cascade ran out. Three paragraphs of diagnosis become two choices, ranked,
 * and cancel stays quiet at the bottom.
 *
 * ## Why the choices are ranked rather than presented evenly
 *
 * They are not equivalent. Searching wider keeps the published rate, keeps the
 * instant product, and costs nothing; taking quotes is slower and hands the
 * pricing back to vendors. Presenting both as neutral cards would be a platform
 * declining to say which of its own products fits — so the first is accented and
 * the second is plain, and each carries the one-line trade-off underneath.
 *
 * ## The closing line is not decoration
 *
 * "We do not raise the price to find someone" answers the question every
 * customer has here and the one this platform must not answer with a control:
 * there is no pay-more button, because the A3 day rate is an Operations-published
 * card above a statutory wage floor and its wage half is paid in cash to people
 * this platform never pays. A "boost" control would advertise a rate nobody
 * could enforce.
 */

export interface NoCrewScreenProps {
  serviceName: string;
  booking: BookingView;
  onBack: () => void;
  onSearchWider: () => void;
  onGetQuotes: () => void;
  onCancel?: () => void;
  isPending: boolean;
  /** Refusals from any of the three commands. */
  notice?: ReactNode;
}

export function NoCrewScreen({
  serviceName,
  booking,
  onBack,
  onSearchWider,
  onGetQuotes,
  onCancel,
  isPending,
  notice,
}: NoCrewScreenProps) {
  return (
    <MobileScreen
      title={serviceName}
      onBack={onBack}
      badge={<Badge tone="warning">Your turn</Badge>}
      action={
        onCancel === undefined ? undefined : (
          <Button
            block
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            className="h-[46px] rounded-[11px] text-[15px]"
          >
            Cancel this request
          </Button>
        )
      }
    >
      {notice}

      <div>
        <ScreenHeading title="No crew took this yet" />
        <p className="mt-2 text-[14px] leading-[22px] text-text-secondary">
          We asked everyone nearby who can field{" "}
          {booking.headcount === 1 ? "one person" : `${booking.headcount} people`}.{" "}
          <strong className="font-bold text-text">Nothing has been charged.</strong>
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <ChoiceRow
          title="Search wider"
          subtitle={`Same ${booking.dayRateLabel} rate, bigger radius`}
          onClick={onSearchWider}
          disabled={isPending}
          emphasis
        />
        <ChoiceRow
          title="Get quotes instead"
          subtitle="Vendors send their own prices. Slower."
          onClick={onGetQuotes}
          disabled={isPending}
        />
      </div>

      <p className="text-[13px] leading-5 text-text-muted">
        We do not raise the price to find someone — the rate is set for your city
        and paid to the crew directly.
      </p>
    </MobileScreen>
  );
}

/** One ranked choice: a full-width card button with the trade-off underneath. */
function ChoiceRow({
  title,
  subtitle,
  onClick,
  disabled,
  emphasis = false,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled: boolean;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-[14px] border px-3.5 py-[15px] text-left",
        "transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-60",
        emphasis
          ? "border-action bg-warning-surface hover:bg-signal-100"
          : "border-line bg-surface hover:bg-surface-hover",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-text">{title}</span>
        <span
          className={cn(
            "mt-0.5 block text-[13px] leading-5",
            emphasis ? "text-warning-text" : "text-text-secondary",
          )}
        >
          {subtitle}
        </span>
      </span>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0 text-text-muted"
      >
        <path d="M7.5 4.5 13 10l-5.5 5.5" />
      </svg>
    </button>
  );
}
