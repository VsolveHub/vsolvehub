"use client";

import Link from "next/link";

import { VisitPanel } from "@/features/visit/view/visit-panel";
import { bookingGroupHref } from "@/lib/routes";

import { useBookingGroup } from "../queries";

/**
 * One visit inside a paid Booking Group.
 *
 * The page shell stays a server component; this client screen owns the heading
 * that names which visit out of how many, because that label only exists once
 * the group has been read.
 */
export function BookingVisitScreen({
  groupId,
  bookingId,
}: {
  groupId: string;
  bookingId: string;
}) {
  const groupQuery = useBookingGroup(groupId);
  const group = groupQuery.data;
  const unitIndex =
    group?.units.findIndex((unit) => unit.booking_id === bookingId) ?? -1;
  const visitPosition = unitIndex >= 0 ? unitIndex + 1 : null;
  const visitTotal = group?.units.length ?? null;

  const heading =
    visitPosition !== null && visitTotal !== null && visitTotal > 1
      ? `Visit ${visitPosition} of ${visitTotal}`
      : "Your visit";

  return (
    <>
      <Link
        href={bookingGroupHref(groupId)}
        className="text-sm font-semibold text-text-link hover:underline"
      >
        ← Back to this booking
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-text">{heading}</h1>
      <div className="mt-4">
        <VisitPanel bookingId={bookingId} groupId={groupId} />
      </div>
    </>
  );
}
