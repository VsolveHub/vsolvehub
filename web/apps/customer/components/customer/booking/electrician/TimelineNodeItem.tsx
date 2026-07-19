import type { StepState } from "@/lib/booking/booking-view";
import type { StepDetails } from "./steps";

const NODE_BG: Record<StepState, string> = {
  completed: "bg-purple-900 border-purple-900 text-white text-[9px] font-bold",
  active: "bg-purple-50 border-purple-900 ring-2 ring-purple-100",
  upcoming: "border-gray-200 bg-white",
};

const LABEL_CLASS: Record<StepState, string> = {
  active: "text-purple-900 text-sm",
  upcoming: "text-gray-400",
  completed: "text-gray-700",
};

const SUBLABEL_CLASS: Record<StepState, string> = {
  active: "text-purple-700 font-semibold",
  upcoming: "text-gray-400",
  completed: "text-gray-400",
};

type Props = {
  state: StepState;
  details: StepDetails;
};

/** One row of the node-style vertical timeline used on mobile and team views. */
export function TimelineNodeItem({ state, details: { label, sublabel } }: Props) {
  const nodeBg = NODE_BG[state];
  return (
    <div className="relative flex flex-col gap-0.5">
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

      <p className={`text-xs font-bold m-0 ${LABEL_CLASS[state]}`}>{label}</p>
      {sublabel && <p className={`text-[10px] m-0 ${SUBLABEL_CLASS[state]}`}>{sublabel}</p>}
    </div>
  );
}
