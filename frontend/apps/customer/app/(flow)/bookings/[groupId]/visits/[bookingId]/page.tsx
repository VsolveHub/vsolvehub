import type { Metadata } from "next";
import Link from "next/link";

import { VisitPanel } from "@/features/visit/view/visit-panel";

/**
 * One visit inside a Booking Group.
 *
 * Nested under the group because that is the customer's mental model — "my
 * booking, the second visit" — and because the back link has somewhere honest
 * to go. The group id is not passed to the panel: `GET /bookings/{id}/` is
 * scoped to the caller by Django, so the route needs no second identifier to
 * prove ownership with, and passing one would invite a client-side check that
 * duplicates a server rule.
 *
 * Nothing is read on the server. An id belonging to someone else produces
 * Django's own 403 in the browser rather than a server render that had to be
 * told who the caller is.
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
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <Link
        href={`/bookings/${groupId}`}
        className="text-sm font-semibold text-text-link hover:underline"
      >
        ← Back to this booking
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-text">Your visit</h1>
      <div className="mt-4">
        <VisitPanel bookingId={bookingId} />
      </div>
    </main>
  );
}
