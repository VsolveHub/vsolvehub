import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@vsolve/ui";

import { ActivityScreen } from "@/features/activity/view/activity-screen";

/**
 * The Activity hub — one door onto bookings, requests and projects.
 *
 * Dynamic and never indexed: every list behind it is somebody's own record.
 *
 * The selected status view lives in `?status=` (active, past, cancelled) so
 * one route and one session gate cover all three lists. An unknown or missing
 * value lands on Upcoming & Active.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your bookings",
  robots: { index: false, follow: false },
};

export default function ActivityPage() {
  return (
    <main>
      <Suspense
        fallback={
          <div className="mx-auto flex w-full max-w-4xl flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
            <Skeleton className="h-9 w-48 rounded-control" />
            <div className="mt-6 flex flex-col gap-3" aria-label="Loading your bookings">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-36 w-full rounded-card" />
              ))}
            </div>
          </div>
        }
      >
        <ActivityScreen />
      </Suspense>
    </main>
  );
}
