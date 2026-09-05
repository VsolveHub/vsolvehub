import type { Metadata } from "next";

import { BookingVisitScreen } from "@/features/bookings/view/booking-visit-screen";

/**
 * One visit inside a Booking Group.
 *
 * Nested under the group because that is the customer's mental model — "my
 * booking, the second visit" — and because the back link has somewhere honest
 * to go. The visit read itself is scoped to the caller by Django; the group
 * id is for navigation and for sibling-unit context on the detail screen.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your visit",
  robots: { index: false, follow: false },
};

export default async function VisitPage({
  params,
}: {
  params: Promise<{ groupId: string; bookingId: string }>;
}) {
  const { groupId, bookingId } = await params;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 lg:pb-16 pt-6">
      <BookingVisitScreen groupId={groupId} bookingId={bookingId} />
    </main>
  );
}
