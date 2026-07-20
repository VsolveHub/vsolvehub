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
  const done = state === "completed";
  const active = state === "active";

  return (
    <div className="relative flex gap-3">
      <div
        className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
          done
            ? "bg-[var(--color-brand)] text-white"
            : active
              ? "bg-[var(--color-brand-light)] text-[var(--color-brand)] ring-2 ring-[var(--color-brand)]"
              : "bg-gray-100 text-gray-400"
        }`}
      >
        {icon}
      </div>
      <div className="pb-0.5">
        <h4 className={`text-sm font-bold ${active || done ? "text-gray-900" : "text-gray-400"}`}>
          {label}
        </h4>
        {sublabel && <p className="mt-0.5 text-xs text-gray-500">{sublabel}</p>}
        {active && (
          <span className="mt-0.5 inline-block text-[11px] font-semibold text-[var(--color-brand)]">
            Just now
          </span>
        )}
        {done && <span className="mt-0.5 inline-block text-[11px] text-gray-400">12:15 PM</span>}
      </div>
    </div>
  );
}
