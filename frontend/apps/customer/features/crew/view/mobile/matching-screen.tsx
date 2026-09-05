"use client";

import { Button } from "@vsolve/ui";
import type { ReactNode } from "react";

import { MobileScreen } from "@/features/booking/view/mobile-screen";
import type { CascadeView, RateTermsView } from "../../adapters";
import { RateTermsLink } from "../rate-terms-sheet";

/**
 * A3 · 1 — Waiting.
 *
 * Nothing to press but Cancel, and Cancel is quiet: a Customer cannot make a
 * supervisor accept, so every other control that could sit here would be one
 * that does nothing. One line names how many supervisors are looking; it is
 * omitted rather than saying "0", because a number that reads as "nobody
 * wants this" is worse than no number at all.
 */

export interface MatchingScreenProps {
  serviceName: string;
  cascade: CascadeView | null;
  terms: RateTermsView;
  /** "4 people · 3 days · from Mon" — the request's own facts. */
  crewLine: string;
  onBack: () => void;
  /** Absent when the server says there is nothing cancellable. */
  onCancel?: () => void;
  isCancelling?: boolean;
  /** Refusals, rendered above the summary by the caller. */
  notice?: ReactNode;
}

export function MatchingScreen({
  serviceName,
  cascade,
  terms,
  crewLine,
  onBack,
  onCancel,
  isCancelling = false,
  notice,
}: MatchingScreenProps) {
  return (
    <MobileScreen
      title={serviceName}
      onBack={onBack}
      action={
        onCancel === undefined ? undefined : (
          <Button
            block
            variant="ghost"
            onClick={onCancel}
            disabled={isCancelling}
            className="h-[46px] rounded-[11px] text-[15px]"
          >
            Cancel request
          </Button>
        )
      }
    >
      {notice}

      <div className="flex flex-col items-center gap-1 pt-4 text-center">
        <span aria-hidden className="text-3xl">
          ⏳
        </span>
        <h2 className="mt-1 text-xl font-bold text-text">Finding your crew</h2>
        <p className="text-sm text-text-secondary">{crewLine}</p>
      </div>

      {cascade !== null && cascade.hasOffersOut ? (
        <p className="text-center text-[0.9375rem] leading-6 text-text">
          {cascade.offersOut} {cascade.offersOut === 1 ? "supervisor" : "supervisors"} nearby{" "}
          {cascade.offersOut === 1 ? "has" : "have"} this. First to accept gets it.
        </p>
      ) : null}

      <p className="text-center text-sm font-semibold text-text">₹0 charged so far</p>

      <p className="text-center text-sm leading-6 text-text-secondary">
        We&rsquo;ll message you when someone accepts. You can close this.
      </p>

      <div className="mt-1 flex justify-center">
        <RateTermsLink terms={terms} />
      </div>
    </MobileScreen>
  );
}
