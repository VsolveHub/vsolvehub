import type { Metadata } from "next";

import { ListingStepGuard } from "@/features/application/view/listing-step-guard";
import { ScheduleStep } from "@/features/application/view/schedule-step";

export const metadata: Metadata = { title: "Working Hours" };

export default function SchedulePage() {
  return (
    <section className="flex flex-col gap-5 pb-20">
      <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-sm flex flex-col gap-5">
        <header className="flex flex-col gap-1 border-b border-line pb-4">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-navy-900">
            Working Hours & Availability
          </h1>
          <p className="text-xs sm:text-sm leading-relaxed text-text-secondary">
            Set your weekly working hours. You will only receive customer bookings during your active shifts.
          </p>
        </header>

        <ListingStepGuard redirectTo="/apply/review">
          <ScheduleStep />
        </ListingStepGuard>
      </div>
    </section>
  );
}
