import type { Metadata } from "next";

import { BookingGroupDetail } from "@/features/bookings/view/group-detail";

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
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <BookingGroupDetail groupId={groupId} />
    </main>
  );
}
