"use client";

import { BOOKING_STEPS, BOOKING_STEP_LABELS, type BookingStep } from "@/lib/bookings/types";

type Props = {
  currentStep: BookingStep;
};

export function BookingFlowHeader({ currentStep }: Props) {
  const currentIndex = BOOKING_STEPS.indexOf(currentStep);

  return (
    <div className="border-b border-gray-100 bg-white px-4 py-4">
      <div className="mx-auto flex max-w-2xl items-center gap-2 overflow-x-auto hide-scrollbar">
        {BOOKING_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <div key={step} className="flex items-center gap-1.5">
              {index > 0 && <span className="text-gray-300" aria-hidden>›</span>}
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                  active
                    ? "bg-[var(--color-brand)] text-white"
                    : done
                      ? "bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {done ? "✓" : index + 1}
              </span>
              <span
                className={`whitespace-nowrap text-xs font-bold ${
                  active || done ? "text-gray-700" : "text-gray-400"
                }`}
              >
                {BOOKING_STEP_LABELS[step]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
