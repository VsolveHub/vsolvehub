import { resolveTimeline } from "@/lib/booking/booking-view";
import { DesktopTimelineItem } from "./DesktopTimelineItem";
import { TimelineNodeItem } from "./TimelineNodeItem";
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
        {timeline.map(({ key: stepKey, index: idx, state }) => (
          <DesktopTimelineItem key={stepKey} stepKey={stepKey} state={state} details={getStepDetails(stepKey, idx)} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col relative pl-6 border-l border-gray-200 ml-2 gap-5 py-1">
      {timeline.map(({ key: stepKey, index: idx, state }) => (
        <TimelineNodeItem key={stepKey} state={state} details={getStepDetails(stepKey, idx)} />
      ))}
    </div>
  );
}
