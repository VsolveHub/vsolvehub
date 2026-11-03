import type { Metadata } from "next";

import { BookingGroupDetail } from "@/features/bookings/view/group-detail";
import { BOOKING_PAGE_FRAME } from "@/features/bookings/view/booking-layout";

/**
 * One Booking Group.
 *
 * The id comes from the route and is passed to a client component that fetches
 * the group itself. Nothing is read on the server, so an unauthorized id
 * produces Django's own 403/404 in the browser rather than a server render that
 * had to be told who the caller is.
 */
export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
};

export default async function BookingGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <main className={`${BOOKING_PAGE_FRAME} min-w-0 overflow-x-clip pb-28 pt-6 lg:pb-8`}>
      <BookingGroupDetail groupId={groupId} />
    </main>
  );
}
