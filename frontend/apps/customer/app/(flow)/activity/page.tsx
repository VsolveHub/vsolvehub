import type { Metadata } from "next";

import { ActivityScreen, toActivityTab } from "@/features/activity/view/activity-screen";

/**
 * The Activity hub — one door onto bookings, requests and projects.
 *
 * Dynamic and never indexed: every list behind it is somebody's own record.
 *
 * The segment lives in `?tab=` rather than in the path so that the three lists
 * share one route and one gate, and so a stale or truncated link lands on the
 * hub instead of a 404 — `toActivityTab` narrows anything it does not recognise
 * to the default.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your activity",
  robots: { index: false, follow: false },
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  return (
    <main>
      <ActivityScreen tab={toActivityTab(tab)} />
    </main>
  );
}
