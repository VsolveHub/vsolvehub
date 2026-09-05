"use client";

import { Button, Disclosure } from "@vsolve/ui";
import type { ReactNode } from "react";

import { MobileScreen } from "@/features/booking/view/mobile-screen";

/**
 * A3 · 2 — Nobody accepted.
 *
 * The cascade ran out. Three real choices, ranked and quiet: search wider
 * keeps the published rate and costs nothing, quotes hands pricing to
 * professionals and is slower, and cancel is last because it is destructive.
 * There is no fourth, pay-more button — the A3 day rate is a published card
 * above a statutory wage floor, and a "boost" control would advertise a rate
 * nobody could enforce.
 */

export interface NoCrewScreenProps {
  serviceName: string;
  dayRateLabel: string;
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
  dayRateLabel,
  onBack,
  onSearchWider,
  onGetQuotes,
  onCancel,
  isPending,
  notice,
}: NoCrewScreenProps) {
  return (
    <MobileScreen title={serviceName} onBack={onBack}>
      {notice}

      <div className="flex flex-col items-center gap-1 pt-4 text-center">
        <span aria-hidden className="text-3xl">
          😕
        </span>
        <h2 className="mt-1 text-xl font-bold text-text">No one free at this rate</h2>
        <p className="text-sm text-text-secondary">Nothing charged.</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <Button block onClick={onSearchWider} loading={isPending} loadingLabel="Widening the search">
          Search wider (same rate)
        </Button>
        <Button block variant="secondary" onClick={onGetQuotes} disabled={isPending}>
          Get quotes instead
        </Button>
        {onCancel !== undefined ? (
          <Button block variant="ghost" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        ) : null}
      </div>

      <Disclosure summary="What &ldquo;quotes instead&rdquo; means">
        Professionals send their own price instead of the published {dayRateLabel} day
        rate. It is slower, and nothing is charged to ask for one.
      </Disclosure>
    </MobileScreen>
  );
}
