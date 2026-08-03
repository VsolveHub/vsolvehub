import type { Metadata } from "next";

import { BookingGroupList } from "@/features/bookings/view/group-list";

/**
 * The customer's bookings.
 *
 * A server shell around a client list, with no server-side data access — so it
 * prerenders, and every row is fetched in the browser under the caller's own
 * credentials. There is no per-caller data at this layer to leak into static
 * output; if that ever changes, this route becomes dynamic in the same change.
 *
 * Never indexed: it is somebody's private booking history.
 */
export const metadata: Metadata = {
  title: "Your bookings",
  robots: { index: false, follow: false },
};

export default function BookingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <h1 className="text-xl font-bold text-text">Your bookings</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Every visit in a booking is confirmed together.
      </p>
      <div className="mt-6">
        <BookingGroupList />
      </div>
    </main>
  );
}
