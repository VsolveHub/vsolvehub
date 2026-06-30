"use client";

type Props = {
  steps: readonly string[];
  labels: Record<string, string>;
  currentStep: string;
};

export function VehicleFlowHeader({ steps, labels, currentStep }: Props) {
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="booking-flow-header">
      <div className="booking-flow-steps">
        {steps.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "pending";
          return (
            <div key={step} className={`booking-flow-step ${state}`}>
              <span className="booking-flow-step-dot">{index + 1}</span>
              <span className="booking-flow-step-label">{labels[step] ?? step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
