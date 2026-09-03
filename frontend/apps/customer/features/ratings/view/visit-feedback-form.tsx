"use client";

import { useState } from "react";

import type { FulfilmentUnit } from "@/features/bookings/queries";

import { ServiceFeedbackDialog } from "./service-feedback-dialog";

/**
 * Feedback for a catalog visit.
 *
 * The form itself now lives in `service-feedback-dialog.tsx` and serves bookings and requests
 * alike — the two used to diverge, with catalogue visits getting a considered dialog and requests
 * getting a bare rating box, for no reason anybody had decided on. This module keeps the
 * booking-shaped entry points: when a visit may still be asked about, and which of several visits
 * to ask about next.
 */

const COMPLETED_VISIT_STATUSES = new Set(["COMPLETED", "PARTIALLY_COMPLETED"]);

export function isVisitWorkComplete(status: string | null | undefined): boolean {
  return status != null && COMPLETED_VISIT_STATUSES.has(status);
}

/**
 * Whether this visit is one the customer can still be asked to rate.
 *
 * ## Why this is not a type predicate
 *
 * It was declared `): bookingId is string`, which TypeScript refuses outright when the parameter
 * is a binding pattern (TS1230) -- and the refusal was doing everyone a favour, because the
 * predicate could not have worked either. A predicate narrows *the argument*, and every caller
 * builds a throwaway object literal to pass in. Narrowing that literal tells you nothing about
 * `unit.booking_id`, which is the value that actually reaches the form.
 *
 * Worse, it failed quietly: an invalid predicate is still a callable function, so the guard
 * compiled at every call site and simply narrowed nothing.
 *
 * So this returns a plain boolean, and callers narrow the id themselves -- on the value they are
 * going to use, which is the only place narrowing is worth anything.
 */
export function canShowVisitFeedback({
  bookingId,
  isPaid,
  unitStatus,
  bookingStatus,
}: {
  readonly bookingId: string | null;
  readonly isPaid: boolean;
  readonly unitStatus: string;
  readonly bookingStatus: string | null;
}): boolean {
  return (
    isPaid &&
    bookingId !== null &&
    unitStatus !== "CANCELLED" &&
    bookingStatus !== "CANCELLED" &&
    isVisitWorkComplete(bookingStatus)
  );
}

/**
 * The two-step feedback sequence for one completed visit.
 *
 * Nothing renders in the visit layout. When the visit is complete and the server still has a
 * question to ask, the dialog opens; closing or finishing it removes it, and a visit with nothing
 * left to ask stays quiet.
 */
export function VisitFeedbackForm({
  bookingId,
  isComplete,
  onFinished,
}: {
  readonly bookingId: string;
  readonly isComplete: boolean;
  readonly onFinished?: () => void;
}) {
  return (
    <ServiceFeedbackDialog
      subject="booking"
      id={bookingId}
      isComplete={isComplete}
      onFinished={onFinished}
    />
  );
}

/**
 * Prompts for the next completed visit that still needs feedback.
 *
 * One at a time, on purpose: a group of four finished visits is four dialogs stacked on arrival,
 * and the honest response to that is to close all of them.
 */
export function CompletedVisitsFeedback({
  units,
  isPaid,
}: {
  readonly units: readonly FulfilmentUnit[];
  readonly isPaid: boolean;
}) {
  const [skipIds, setSkipIds] = useState<readonly string[]>([]);
  const next = units.find((unit) => {
    if (unit.booking_id === null || skipIds.includes(unit.booking_id)) return false;
    return canShowVisitFeedback({
      bookingId: unit.booking_id,
      isPaid,
      unitStatus: unit.status,
      bookingStatus: unit.booking_status,
    });
  });

  if (next?.booking_id == null) return null;

  const bookingId = next.booking_id;
  return (
    <VisitFeedbackForm
      bookingId={bookingId}
      isComplete
      onFinished={() =>
        setSkipIds((ids) => (ids.includes(bookingId) ? ids : [...ids, bookingId]))
      }
    />
  );
}
