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
    <div className="flex items-center gap-2">
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black transition-all ${
          state === "active"
            ? "bg-gray-900 text-white shadow-sm"
            : state === "done"
              ? "bg-gray-900 text-white"
              : "border-2 border-gray-200 bg-white text-gray-400"
        }`}
      >
        {state === "done" ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          num
        )}
      </div>
      <span
        className={`text-sm font-semibold ${
          state === "active" ? "text-gray-900" : state === "done" ? "text-gray-900" : "text-gray-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function StepConnector({ step, after }: { step: Step; after: Step }) {
  const afterIdx = ORDER.indexOf(after);
  const cur = ORDER.indexOf(step);
  const filled = cur > afterIdx;
  return (
    <div className={`h-px w-10 flex-shrink-0 ${filled ? "bg-gray-900" : "bg-gray-200"}`} />
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
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900">{categoryName}</h1>
            <div className="mt-0.5 flex items-center gap-1 text-sm text-gray-400">
              <span>Services</span>
              <span className="text-gray-300">/</span>
              <span className="font-medium text-gray-500">{categoryName}</span>
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-0 overflow-x-auto hide-scrollbar">
          <StepPill step={step} target="service" num="1" label="Select" />
          <StepConnector step={step} after="service" />
          <StepPill step={step} target="guidelines" num="2" label="Scope" />
          <StepConnector step={step} after="guidelines" />
          <StepPill step={step} target="details" num="3" label="Requirements" />
        </div>
      </div>
    </div>
  );
}
