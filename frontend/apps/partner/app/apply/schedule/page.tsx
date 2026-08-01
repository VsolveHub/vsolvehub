import type { Metadata } from "next";
import Link from "next/link";

import { ScheduleStep } from "@/features/application/view/schedule-step";

export const metadata: Metadata = { title: "Your hours" };

export default function SchedulePage() {
  return (
    <section>
      <h1 className="text-xl font-bold text-text sm:text-2xl">Your hours</h1>
      <p className="mt-1.5 max-w-prose text-sm text-text-secondary">
        You are only offered work in the hours you publish here. Nothing is
        assumed — an empty week means no offers.
      </p>

      <div className="mt-6">
        <ScheduleStep />
      </div>

      <p className="mt-8">
        <Link
          href="/apply"
          className="min-h-11 font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          Back to your application
        </Link>
      </p>
    </section>
  );
}
