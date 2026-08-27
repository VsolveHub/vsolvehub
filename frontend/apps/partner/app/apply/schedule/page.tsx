import type { Metadata } from "next";

import { ScheduleStep } from "@/features/application/view/schedule-step";

export const metadata: Metadata = { title: "Your hours" };

/**
 * The hours step.
 *
 * Not wrapped in `ApplicationEditor`: hours are saved by their own endpoint
 * (`ScheduleStep` owns the mutation), so there is no draft for the editor to
 * hold and no partial patch for it to compute. The heading is drawn here to
 * match every other step's shape.
 *
 * The old version also rendered its own "Back to your application" link. The
 * shell carries a back control and an exit now, so a third navigation inside the
 * content would be a third thing to explain.
 */
export default function SchedulePage() {
  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[1.375rem] font-extrabold leading-tight tracking-[-0.02em] text-text">
          Your hours
        </h1>
        <p className="text-[0.9375rem] leading-relaxed text-text-secondary">
          You are only offered work in the hours you publish here. Nothing is
          assumed — an empty week means no offers.
        </p>
      </header>

      <ScheduleStep />
    </section>
  );
}
