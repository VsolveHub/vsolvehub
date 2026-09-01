"use client";

import { Button } from "@vsolve/ui";
import { useState } from "react";

import { canCancel, canReschedule, rescheduleBlockedReason, type Visit } from "../queries";
import { CancelVisitSheet } from "./cancel-visit-sheet";
import { RescheduleVisitSheet } from "./reschedule-visit-sheet";

/**
 * The two changes a customer can make to a booked visit, offered where the visit is.
 *
 * Which one is prominent depends on what happened. On an ordinary visit, rescheduling is the
 * gentler answer and cancelling is the fallback. On a visit whose professional released,
 * `canReschedule` is false — there is nobody to move — so cancelling stands alone.
 *
 * Shared by the visit page and the one-visit booking overview so the same server rules,
 * sheets and copy are used in both places.
 */
export function VisitActions({ visit }: { visit: Visit }) {
  const [cancelling, setCancelling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const offersReschedule = canReschedule(visit);
  const offersCancel = canCancel(visit);
  const blockedReason = offersReschedule ? "" : rescheduleBlockedReason(visit);

  if (!offersCancel && !offersReschedule) return null;

  return (
    <section aria-labelledby="visit-actions" className="mt-6 border-t border-line pt-5">
      <h3 id="visit-actions" className="sr-only">
        Change this visit
      </h3>
      <div className="flex flex-wrap gap-3">
        {offersReschedule ? (
          <Button id="visit-reschedule-action" variant="outline" onClick={() => setRescheduling(true)}>
            Reschedule
          </Button>
        ) : null}
        {offersCancel ? (
          <Button variant="ghost" onClick={() => setCancelling(true)}>
            Cancel this visit
          </Button>
        ) : null}
      </div>
      {blockedReason ? (
        <p className="mt-3 text-sm leading-6 text-text-secondary">{blockedReason}</p>
      ) : null}
      {visit.status === "RECOVERY_REQUIRED" ? (
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          You do not have to decide now — if we cannot find anyone, we cancel this visit and
          refund it in full on our own.
        </p>
      ) : null}

      {offersCancel ? (
        <CancelVisitSheet visit={visit} open={cancelling} onOpenChange={setCancelling} />
      ) : null}
      {offersReschedule ? (
        <RescheduleVisitSheet visit={visit} open={rescheduling} onOpenChange={setRescheduling} />
      ) : null}
    </section>
  );
}
