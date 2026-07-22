import type { Step } from "./types";

const ORDER: Step[] = ["service", "guidelines", "details"];

export function FlowHeader({
  categoryName,
  step,
  onBack,
}: {
  categoryName: string;
  step: Step;
  onBack: () => void;
}) {
  const steps: { target: Step; num: string; label: string }[] = [
    { target: "service", num: "1", label: "Select" },
    { target: "guidelines", num: "2", label: "Scope" },
    { target: "details", num: "3", label: "Requirements" },
  ];

  const cur = ORDER.indexOf(step);

  return (
    <div className="border-b border-[#c6c6cd]/40 bg-white/90 backdrop-blur-md shadow-xs">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Go back"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[#0b1c30] transition-colors hover:bg-slate-200 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-[#0b1c30]">Service Details</h1>
              <div className="text-xs text-[#45464d] font-medium mt-0.5">
                Services <span className="mx-1 text-[#76777d]">•</span>{" "}
                <span className="text-[#45464d] font-medium">{categoryName}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 overflow-x-auto hide-scrollbar py-1">
            {steps.map((item, idx) => {
              const me = ORDER.indexOf(item.target);
              const state = me === cur ? "active" : me < cur ? "done" : "todo";

              return (
                <div key={item.target} className="flex items-center gap-2 shrink-0">
                  {idx > 0 && (
                    <div className="h-[2px] w-8 sm:w-16 bg-slate-200 shrink-0" />
                  )}
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition-all ${
                          state === "done"
                            ? "bg-[#ea580c] text-white font-bold"
                            : state === "active"
                              ? "bg-[#0b1c30] text-white font-bold shadow-xs"
                              : "bg-slate-100 text-slate-400 font-medium"
                        }`}
                      >
                        {state === "done" ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          item.num
                        )}
                      </div>
                      <span
                        className={`text-xs ${
                          state === "active"
                            ? "font-bold text-[#0b1c30]"
                            : state === "done"
                              ? "font-semibold text-slate-700"
                              : "font-medium text-slate-400"
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
