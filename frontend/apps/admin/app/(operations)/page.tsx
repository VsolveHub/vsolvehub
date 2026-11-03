import type { Metadata } from "next";

import { AttentionStrip } from "@/features/dashboard/attention";
import { BusinessSnapshot, KillSwitchBanner, MyCases, QuickActions } from "@/features/dashboard/home-view";

export const metadata: Metadata = {
  title: "Home",
};

/**
 * Home answers three questions, in this order: is anything broken or waiting on me, how is the
 * business doing, and what do I usually do next. The sidebar stays the map of the console.
 */
export default function OperationsHomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <KillSwitchBanner />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AttentionStrip />
        </div>
        <QuickActions />
      </div>
      <BusinessSnapshot />
      <MyCases />
    </div>
  );
}
