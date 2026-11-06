// Ported from frontend/apps/customer/features/ratings/view/visit-feedback-form.tsx
import { useState } from "react";

import type { FulfilmentUnit } from "@/features/bookings/queries";
import { ServiceFeedbackDialog } from "./service-feedback-dialog";

const COMPLETED_VISIT_STATUSES = new Set(["COMPLETED", "PARTIALLY_COMPLETED"]);

export function isVisitWorkComplete(status: string | null | undefined): boolean {
  return status != null && COMPLETED_VISIT_STATUSES.has(status);
}

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

