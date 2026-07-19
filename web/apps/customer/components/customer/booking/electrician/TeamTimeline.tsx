import { resolveTimeline } from "@/lib/booking/booking-view";
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
        const { label, sublabel } = details;

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
