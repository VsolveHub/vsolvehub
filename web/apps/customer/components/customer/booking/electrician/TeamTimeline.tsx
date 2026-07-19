import { resolveTimeline } from "@/lib/booking/booking-view";
import { TimelineNodeItem } from "./TimelineNodeItem";
import type { StepDetails } from "./steps";

type Props = {
  currentStatusIndex: number;
  getStepDetails: (stepKey: string, idx: number) => StepDetails | null;
};

export function TeamTimeline({ currentStatusIndex, getStepDetails }: Props) {
  const timeline = resolveTimeline(currentStatusIndex);

  return (
    <div className="flex flex-col relative pl-6 border-l border-gray-200 ml-2 gap-5 py-1">
      {timeline.map(({ key: stepKey, index: idx, state }) => {
        const details = getStepDetails(stepKey, idx);
        if (!details) return null;
        return <TimelineNodeItem key={stepKey} state={state} details={details} />;
      })}
    </div>
  );
}
