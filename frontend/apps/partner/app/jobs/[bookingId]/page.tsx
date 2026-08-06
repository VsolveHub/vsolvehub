import type { Metadata } from "next";
import Link from "next/link";

import { WorkPanel } from "@/features/work/view/work-panel";

/**
 * One accepted job, from travelling to it through reporting what was done.
 *
 * `/jobs/…` rather than `/offers/…`: an offer is something to decide about and
 * an accepted job is something to do, and they are different screens at
 * different times. Sharing a route would mean the Partner's inbox and their
 * work list were the same list, which stops being true the moment they hold two
 * jobs and are offered a third.
 *
 * The shell comes from `app/jobs/layout.tsx`. It used to be mounted here too,
 * which — once the layout existed — rendered two headers and two bottom
 * navigations on the same screen.
 *
 * `force-dynamic`, never indexed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your job",
  robots: { index: false, follow: false },
};

export default async function JobPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      {/* Back to the job list, not the offer inbox. Arriving here means the job
          was already accepted, so the inbox is where it came from rather than
          where it belongs. */}
      <Link href="/jobs" className="text-sm font-semibold text-text-link hover:underline">
        ← All jobs
      </Link>
      <h1 className="mt-4 text-lg font-bold text-text">Your job</h1>
      <div className="mt-4">
        <WorkPanel bookingId={bookingId} />
      </div>
    </main>
  );
}
