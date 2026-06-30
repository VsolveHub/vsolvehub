"use client";

import { BOOKING_STEPS, BOOKING_STEP_LABELS, type BookingStep } from "@/lib/bookings/types";

type Props = {
  currentStep: BookingStep;
};

export function BookingFlowHeader({ currentStep }: Props) {
  const currentIndex = BOOKING_STEPS.indexOf(currentStep);

  return (
    <div className="booking-flow-header">
      <div className="booking-flow-steps">
        {BOOKING_STEPS.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "pending";
          return (
            <div key={step} className={`booking-flow-step ${state}`}>
              <span className="booking-flow-step-dot">{index + 1}</span>
              <span className="booking-flow-step-label">{BOOKING_STEP_LABELS[step]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
