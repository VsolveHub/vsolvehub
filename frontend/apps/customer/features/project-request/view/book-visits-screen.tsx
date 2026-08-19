"use client";

import { Button, Disclosure } from "@vsolve/ui";
import type { ReactNode } from "react";

import { MobileScreen } from "@/features/booking/view/mobile-screen";
import type { PlanCheckoutView, VisitSlotRow } from "@/features/access/adapters";
import { formatVisitSlot } from "@/features/access/adapters";

/**
 * A5 · 6 — Book your visits.
 *
 * The one moment an A5 customer is asked for money before any work is agreed.
 *
 * ## The orange eyebrow is the held-state signature
 *
 * It is the only orange thing in the whole A5 flow, and it is not a control. A5
 * is the considered path and its buttons are navy; orange in this system means
 * *something is happening now* — which is exactly what a held slot is. Using it
 * for a button here would make the flow read as dispatch, and using navy for the
 * eyebrow would lose the one signal that says this time is being kept for you.
 *
 * ## The pay strip is navy-700, matching the action
 *
 * A3's equivalent strip is navy-900, matching that flow's dark rate panel. Here
 * the strip and the CTA are the same colour on purpose: the strip states the
 * amount and the button takes it, and on a phone they are two inches apart.
 */

export interface BookVisitsScreenProps {
  view: PlanCheckoutView;
  /** The slot that opened this checkout. Null in the states that have none. */
  heldSlot: VisitSlotRow | null;
  /** Where the visit is, from the request's address. */
  addressLine: string | null;
  onBack: () => void;
  onPay?: () => void;
  isPaying?: boolean;
  /** Rendered instead of the action in the states with nothing to press. */
  status?: ReactNode;
  notice?: ReactNode;
}

export function BookVisitsScreen({
  view,
  heldSlot,
  addressLine,
  onBack,
  onPay,
  isPaying = false,
  status,
  notice,
}: BookVisitsScreenProps) {
  const heldTime =
    heldSlot === null ? null : formatVisitSlot(heldSlot.scheduledFor, heldSlot.timeZone);

  return (
    <MobileScreen
      title="Book your visits"
      onBack={onBack}
      reassurance={onPay === undefined ? undefined : "UPI, card or netbanking"}
      reassurancePosition="below"
      action={
        onPay === undefined ? undefined : (
          <Button
            block
            variant="secondary"
            onClick={onPay}
            loading={isPaying}
            loadingLabel="Starting your payment"
            className="h-[50px] rounded-[11px] text-[15px]"
          >
            Pay {view.chargeableLabel}
          </Button>
        )
      }
    >
      {notice}

      {heldTime !== null ? (
        <div className="rounded-2xl bg-navy-900 p-[18px] text-text-inverse">
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-signal-500">
            Held for you
          </p>
          <p className="mt-2 text-[21px] font-bold leading-[27px]">{heldTime}</p>
          <p className="mt-1 text-[13.5px] leading-5 text-warm-300">
            {[heldSlot?.vendorName, addressLine].filter(Boolean).join(", ") ||
              "A professional is holding this time"}
          </p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
        <div className="flex items-baseline justify-between gap-3 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-text">
              {view.planSize === 1 ? "1-visit plan" : `${view.planSize}-visit plan`}
            </p>
            <p className="mt-0.5 text-xs leading-4 text-text-muted">
              {view.planSize === 1
                ? "The site visit and the written estimate"
                : `All ${view.planSize} site visits and their written estimates`}
            </p>
          </div>
          <p className="shrink-0 text-[15px] font-bold tabular-nums text-text">
            {view.priceLabel}
          </p>
        </div>

        {view.creditLabel !== null ? (
          <div className="flex items-baseline justify-between gap-3 border-t border-line px-3.5 py-2.5">
            <p className="text-[13px] text-text-secondary">Credit already applied</p>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-success-text">
              −{view.creditLabel}
            </p>
          </div>
        ) : null}

        <div className="flex items-baseline justify-between gap-3 bg-action-secondary px-3.5 py-[15px] text-action-secondary-text">
          <p className="text-sm font-bold">To pay now</p>
          <p className="shrink-0 text-[22px] font-extrabold tabular-nums">
            {view.chargeableLabel}
          </p>
        </div>
      </div>

      {status}

      <p className="text-[13px] leading-5 text-text-secondary">
        One payment for the whole plan. Any visit that does not happen refunds its
        share without you asking.
      </p>

      <Disclosure summary="What the visit fee covers" hint="Not the project price">
        <p>
          Travel and the professional&rsquo;s time on site, plus a written estimate
          you keep whether or not you hire them.{" "}
          <strong className="font-semibold text-text">
            It is not part of the project price.
          </strong>
        </p>
      </Disclosure>
    </MobileScreen>
  );
}
