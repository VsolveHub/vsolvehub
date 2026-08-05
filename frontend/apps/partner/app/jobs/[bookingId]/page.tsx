import type { Metadata } from "next";
import Link from "next/link";

import { PartnerShell } from "@/features/session/partner-shell";
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
 * Behind the shared shell, `force-dynamic`, never indexed.
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
    <PartnerShell>
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <Link href="/offers" className="text-sm font-semibold text-text-link hover:underline">
          ← Back to your offers
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-text">Your job</h1>
        <div className="mt-4">
          <WorkPanel bookingId={bookingId} />
        </div>
      </main>
    </PartnerShell>
  );
}
