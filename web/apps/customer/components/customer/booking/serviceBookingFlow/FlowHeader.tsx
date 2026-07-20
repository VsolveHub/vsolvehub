import type { Step } from "./types";

const ORDER: Step[] = ["service", "guidelines", "details"];

function StepPill({
  step,
  target,
  num,
  label,
}: {
  step: Step;
  target: Step;
  num: string;
  label: string;
}) {
  const me = ORDER.indexOf(target);
  const cur = ORDER.indexOf(step);
  const state = me === cur ? "active" : me < cur ? "done" : "todo";
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
          state === "active"
            ? "bg-[var(--color-brand)] text-white"
            : state === "done"
              ? "bg-[var(--color-brand)]/15 text-[var(--color-brand)]"
              : "bg-gray-100 text-gray-400"
        }`}
      >
        {state === "done" ? "✓" : num}
      </div>
      <span className={`text-xs font-bold ${state === "todo" ? "text-gray-400" : "text-gray-700"}`}>
        {label}
      </span>
    </div>
  );
}

export function FlowHeader({
  categoryName,
  step,
  onBack,
}: {
  categoryName: string;
  step: Step;
  onBack: () => void;
}) {
  return (
    <div className="border-b border-gray-100 bg-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg text-gray-700 transition-colors hover:bg-gray-200"
          >
            ←
          </button>
          <div>
            <h1 className="text-lg font-black text-gray-900">{categoryName}</h1>
            <div className="text-xs text-gray-400">
              Services <span aria-hidden>›</span>{" "}
              <strong className="text-gray-600">{categoryName}</strong>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 overflow-x-auto hide-scrollbar">
          <StepPill step={step} target="service" num="1" label="Select" />
          <span className="text-gray-300" aria-hidden>›</span>
          <StepPill step={step} target="guidelines" num="2" label="Scope" />
          <span className="text-gray-300" aria-hidden>›</span>
          <StepPill step={step} target="details" num="3" label="Requirements" />
        </div>
      </div>
    </div>
  );
}
