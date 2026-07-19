import type { StepState } from "@/lib/booking/booking-view";
import type { StepDetails } from "./steps";

const STATUS_ICON: Record<StepState, string> = {
  completed: "✓",
  active: "🛵",
  upcoming: "○",
};

type Props = {
  stepKey: string;
  state: StepState;
  details: StepDetails;
};

export function DesktopTimelineItem({ stepKey, state, details: { label, sublabel } }: Props) {
  const icon = stepKey === "PENDING" && state === "active" ? "✓" : STATUS_ICON[state];

  return (
    <div className={`timeline-item-v3 ${state}`}>
      <div className="timeline-node-v3">{icon}</div>
      <div className="timeline-content-v3">
        <h4 className="timeline-label-v3">{label}</h4>
        {sublabel && <p className="timeline-sublabel-v3">{sublabel}</p>}
        {state === "active" && <span className="timeline-time-v3">Just now</span>}
        {state === "completed" && <span className="timeline-time-v3">12:15 PM</span>}
      </div>
    </div>
  );
}
