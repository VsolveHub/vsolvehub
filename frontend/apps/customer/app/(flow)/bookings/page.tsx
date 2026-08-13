import type { Metadata } from "next";
import Link from "next/link";

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

      {/* The way in to `M2-FE-509`. A workforce engagement is a booking from the
          Customer's side, so it belongs under this noun — but it is a different
          record on a different endpoint, and merging the two lists would put one
          set of words over two different promises about who holds the money.
          A link rather than a section: most Customers have never hired a crew,
          and an empty second list on this page would be noise for them. */}
      <p className="mt-8 text-sm leading-6 text-text-secondary">
        Hired workers for a job through Vsolve?{" "}
        <Link href="/bookings/workforce" className="font-medium text-text-link hover:underline">
          Those bookings are here
        </Link>
        .
      </p>
    </main>
  );
}
