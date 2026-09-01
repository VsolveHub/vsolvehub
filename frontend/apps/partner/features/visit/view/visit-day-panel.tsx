"use client";

import type { EnquiryRecord } from "@/features/enquiry/model/wire";

import { useVisitDay } from "./use-visit-day";
import { VisitActionBar } from "./visit-action-bar";
import { VisitNowCard } from "./visit-now-card";

/**
 * The A5 plan visit on this enquiry: where it stands, and the commands that
 * move it — as one drop-in block.
 *
 * ## Why this is now a composition
 *
 * The state card and the action bar are separate components because the bar is
 * `sticky bottom-0` and therefore has to be the **last** child of the scrolling
 * screen, while the card belongs at the top with the other facts. The enquiry
 * screen places each one itself and shares their state through `useVisitDay`.
 *
 * `visit-screen.tsx` — the `/visit` sibling route — wants neither of those
 * decisions, so it gets the pair back as one component. The behaviour is
 * identical; only who chooses the placement differs.
 *
 * ## What this panel guarantees, wherever it is mounted
 *
 * - An A5 estimate may only be submitted against a `COMPLETED` visit
 *   (`m2_visit_not_completed` is the refusal), so arrival and completion live
 *   beside the estimate rather than on some other screen: they happen in the
 *   same five minutes, on the same phone, at the same address.
 * - Arrival is proved by the customer's code (contract 1.39.0) and nothing
 *   else. Entering it is what starts the visit, and it is proof because the two
 *   of you have to be standing together for the digits to move.
 * - No money is promised for arriving. The visit payout is earned on a
 *   completed visit **plus** a usable estimate inside the window.
 */

export interface VisitDayPanelProps {
  readonly enquiry: EnquiryRecord;
  /** Where the on-site estimate composer lives, for this workspace. */
  readonly estimateHref: string;
  /** The arrival-code route for this enquiry. */
  readonly arrivalHref: string;
  /** The server says this invitation already has a submitted estimate. */
  readonly estimateSubmitted?: boolean;
  /** False when the parent renders the estimate record and its revise action. */
  readonly showEstimateAction?: boolean;
  /** True while the held visit is checking whether customer payment cleared. */
  readonly isRefreshing?: boolean;
}

export function VisitDayPanel({
  enquiry,
  estimateHref,
  arrivalHref,
  estimateSubmitted = false,
  showEstimateAction = true,
  isRefreshing = false,
}: VisitDayPanelProps) {
  const controls = useVisitDay(enquiry);
  if (controls === null) return null;

  return (
    <>
      <VisitNowCard
        controls={controls}
        enquiry={enquiry}
        estimateSubmitted={estimateSubmitted}
        isRefreshing={isRefreshing}
      />
      <VisitActionBar
        controls={controls}
        enquiry={enquiry}
        estimateHref={estimateHref}
        arrivalHref={arrivalHref}
        estimateSubmitted={estimateSubmitted}
        showEstimateAction={showEstimateAction}
      />
    </>
  );
}
