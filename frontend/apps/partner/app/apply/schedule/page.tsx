import type { Metadata } from "next";

import { ListingStepGuard } from "@/features/application/view/listing-step-guard";
import { ScheduleHeader, ScheduleStep } from "@/features/application/view/schedule-step";

export const metadata: Metadata = { title: "Working Hours" };

export default function SchedulePage() {
  return (
    <section className="flex flex-col gap-5 pb-20">
      <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-sm flex flex-col gap-5">
        <ScheduleHeader />

        <ListingStepGuard redirectTo="/apply/review">
          <ScheduleStep />
        </ListingStepGuard>
      </div>
    </section>
  );
}
