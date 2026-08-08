"use client";

import { Button, ErrorState, Sheet, SkeletonRegion } from "@vsolve/ui";
import { useState } from "react";

import { PreferredStartPicker } from "@/features/booking/view/preferred-start-picker";

import { describeRescheduleFailure } from "../reasons";
import { useRescheduleVisit, useRescheduleWindows, type Visit } from "../queries";

/**
 * Moving one visit, from the same slot grid the customer booked it on.
 *
 * ## Why the grid and not a time field
 *
 * A free datetime field asks the customer to guess. The times a service area actually opens,
 * the width of an arrival window for this job's duration, and whether anybody is free are all
 * server knowledge, and a field that accepts any instant offers hundreds that will be refused.
 * `GET /bookings/{id}/reschedule-windows/` publishes the same grid `POST /booking/windows/`
 * does — one `build_arrival_window_grid` behind both — scoped to this booked visit rather than
 * to a cart.
 *
 * ## What the server does that this screen must not
 *
 * It discounts this visit's own reservation (otherwise the visit blocks itself out of its own
 * slot), applies the minimum-notice rule as `TOO_SOON` rather than hiding those slots, and
 * decides who serves the new time — the original professional if they are free, someone else if
 * not. None of that is recomputed here. Availability is still preliminary: `reschedule_booking`
 * re-checks under its own locks and the exclusion constraint has the last word, so a slot that
 * looked open can still come back refused, and that refusal is rendered in full.
 */

export function RescheduleVisitSheet({
  visit,
  open,
  onOpenChange,
}: {
  visit: Visit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Unmounted while closed, so reopening starts from the visit's current truth rather than
  // from a stale draft this component was holding when it last closed — the same reason the
  // checkout slots modal splits its body out.
  if (!open) return null;
  return <RescheduleSheetBody visit={visit} onOpenChange={onOpenChange} />;
}

function RescheduleSheetBody({
  visit,
  onOpenChange,
}: {
  visit: Visit;
  onOpenChange: (open: boolean) => void;
}) {
  const windows = useRescheduleWindows(visit.id);
  const reschedule = useRescheduleVisit();
  const [selected, setSelected] = useState<string | null>(null);

  function close() {
    onOpenChange(false);
  }

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Reschedule this visit"
      description="Pick a new arrival window. We will keep your professional if they are free, and find someone else if they are not."
      dismissable={!reschedule.isPending}
      footer={
        <>
          <Button variant="ghost" disabled={reschedule.isPending} onClick={close}>
            Keep the current time
          </Button>
          <Button
            disabled={selected === null}
            loading={reschedule.isPending}
            loadingLabel="Rescheduling"
            onClick={() =>
              selected !== null &&
              reschedule.mutate(
                {
                  bookingId: visit.id,
                  expectedVersion: visit.version,
                  // Sent exactly as the server published it. The client never composes an
                  // instant — every time it can request is one this grid carried.
                  newRequestedStart: selected,
                },
                { onSuccess: close },
              )
            }
          >
            Reschedule
          </Button>
        </>
      }
    >
      {reschedule.isError ? (
        <ErrorState
          inline
          className="mb-4"
          title="We could not reschedule this visit"
          message={describeRescheduleFailure(reschedule.error)}
        />
      ) : null}

      {windows.isError ? (
        <ErrorState
          title="We could not load available times"
          message="Nothing has changed and your visit is still booked for its original time."
          actionLabel="Try again"
          onAction={() => void windows.refetch()}
        />
      ) : (
        <SkeletonRegion loading={windows.isPending} label="Loading available times">
          {windows.data ? (
            <PreferredStartPicker
              windows={windows.data}
              selectedStart={selected}
              onSelect={setSelected}
              footnote="Rescheduling is free. If nobody can take the window you pick, we will say so and leave this visit exactly as it is."
            />
          ) : null}
        </SkeletonRegion>
      )}
    </Sheet>
  );
}
