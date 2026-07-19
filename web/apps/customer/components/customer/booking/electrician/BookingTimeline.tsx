import { resolveTimeline } from "@/lib/booking/booking-view";
import type { StepDetails } from "./steps";

type Props = {
  currentStatusIndex: number;
  getStepDetails: (stepKey: string, idx: number) => StepDetails;
  variant: "desktop" | "mobile";
};

export function BookingTimeline({ currentStatusIndex, getStepDetails, variant }: Props) {
  const timeline = resolveTimeline(currentStatusIndex);

  if (variant === "desktop") {
    return (
      <div className="tracker-timeline-v3">
        {timeline.map(({ key: stepKey, index: idx, state }) => {
          const { label, sublabel } = getStepDetails(stepKey, idx);

          let statusClass = "upcoming";
          let icon = "○";
          if (state === "completed") {
            statusClass = "completed";
            icon = "✓";
          } else if (state === "active") {
            statusClass = "active";
            icon = "🛵";
          }

          if (stepKey === "PENDING" && state === "active") {
            icon = "✓";
          }

          return (
            <div key={stepKey} className={`timeline-item-v3 ${statusClass}`}>
              <div className="timeline-node-v3">{icon}</div>
              <div className="timeline-content-v3">
                <h4 className="timeline-label-v3">{label}</h4>
                {sublabel && <p className="timeline-sublabel-v3">{sublabel}</p>}
                {state === "active" && <span className="timeline-time-v3">Just now</span>}
                {state === "completed" && <span className="timeline-time-v3">12:15 PM</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col relative pl-6 border-l border-gray-200 ml-2 gap-5 py-1">
      {timeline.map(({ key: stepKey, index: idx, state }) => {
        const { label, sublabel } = getStepDetails(stepKey, idx);

        let nodeBg = "border-gray-200 bg-white";
        if (state === "completed") {
          nodeBg = "bg-purple-900 border-purple-900 text-white text-[9px] font-bold";
        } else if (state === "active") {
          nodeBg = "bg-purple-50 border-purple-900 ring-2 ring-purple-100";
        }

        return (
          <div key={stepKey} className="relative flex flex-col gap-0.5">
            {state === "completed" ? (
              <span className={`absolute -left-[27px] top-0.5 w-4 h-4 rounded-full border ${nodeBg} flex items-center justify-center select-none`}>
                ✓
              </span>
            ) : state === "active" ? (
              <span className={`absolute -left-[27px] top-1 w-4 h-4 rounded-full border ${nodeBg} flex items-center justify-center select-none`}>
                <span className="w-1.5 h-1.5 bg-purple-900 rounded-full" />
              </span>
            ) : (
              <span className={`absolute -left-[27px] top-1 w-4 h-4 rounded-full border ${nodeBg} flex items-center justify-center select-none`} />
            )}

            <p className={`text-xs font-bold m-0 ${state === "active" ? "text-purple-900 text-sm" : state === "upcoming" ? "text-gray-400" : "text-gray-700"}`}>
              {label}
            </p>
            {sublabel && (
              <p className={`text-[10px] m-0 ${state === "active" ? "text-purple-700 font-semibold" : "text-gray-400"}`}>
                {sublabel}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
