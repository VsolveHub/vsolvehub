"use client";

import { Button, ErrorState, cn } from "@vsolve/ui";

import { MobileScreen, ScreenHeading } from "@/features/booking/view/mobile-screen";
import type { RequirementQuestionView } from "@/features/requirement/adapters";

export interface WorkPickerScreenProps {
  serviceName: string;
  question: RequirementQuestionView | null;
  value: string | null;
  isWide: boolean;
  onSelect: (value: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function WorkPickerScreen({
  serviceName,
  question,
  value,
  isWide,
  onSelect,
  onContinue,
  onBack,
}: WorkPickerScreenProps) {
  const selected = question?.options?.find((option) => option.value === value) ?? null;
  const actionLabel = selected === null ? "Choose work to continue" : "Continue with this work";

  if (!isWide) {
    return (
      <MobileScreen
        title="Choose the work"
        onBack={onBack}
        step="Step 1 of 3"
        reassurance="Choosing here creates no request."
        action={
          <Button
            block
            onClick={onContinue}
            disabled={selected === null}
            className="h-[50px] rounded-[11px] text-[15px]"
          >
            {actionLabel}
          </Button>
        }
      >
        <div className="crew-stage-enter">
          <ScreenHeading eyebrow={serviceName} title="What will they be doing?" />
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            <strong className="font-bold text-text">Required.</strong> Pick the closest match. You
            can change it before you see the rate.
          </p>
          <div className="mt-5">
            <WorkOptions question={question} value={value} onSelect={onSelect} />
          </div>
        </div>
      </MobileScreen>
    );
  }

  return (
    <div className="crew-stage-enter min-h-[calc(100dvh-5rem)] bg-canvas pb-16">
      <div className="mx-auto w-full max-w-6xl px-6 pt-6">
        <header className="relative overflow-hidden rounded-[30px] bg-navy-900 px-8 py-8 text-white">
          <div aria-hidden className="absolute -right-20 -top-28 size-72 rounded-full bg-signal-500/20 blur-3xl" />
          <div className="relative grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-white/75 transition-colors duration-base hover:text-white focus-visible:outline-white"
              >
                <BackArrow />
                Browse crews
              </button>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-signal-300">
                {serviceName}
              </p>
              <h1 className="mt-2 max-w-2xl text-balance text-4xl font-bold leading-tight tracking-[-0.03em]">
                Start with the work, not the numbers.
              </h1>
              <p className="mt-3 max-w-xl text-base leading-7 text-white/72">
                Choose what the crew will spend most of the day doing. We will shape the people,
                days and site around it next.
              </p>
            </div>
            <SiteBoardSignal />
          </div>
        </header>

        <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_270px]">
          <section aria-labelledby="work-picker-heading">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-signal-700">
                  Step 1 of 3
                </p>
                <h2 id="work-picker-heading" className="mt-1 text-2xl font-bold tracking-tight text-text">
                  What will they be doing?
                </h2>
              </div>
              <p className="hidden text-sm text-text-muted sm:block">Required · all available work types</p>
            </div>
            <div className="mt-5">
              <WorkOptions question={question} value={value} onSelect={onSelect} wide />
            </div>
          </section>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-[22px] border border-line bg-surface p-5 shadow-card">
              <ProgressRail active="work" />
              <div className="mt-6 border-t border-line pt-5">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-text-muted">
                  Your choice
                </p>
                <p className="mt-2 min-h-12 text-lg font-bold leading-6 text-text" aria-live="polite">
                  {selected?.label ?? "Nothing selected yet"}
                </p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {selected?.description ?? "Tap a work card to see it here."}
                </p>
                <Button block className="mt-5" onClick={onContinue} disabled={selected === null}>
                  {selected === null ? "Choose work to continue" : "Plan this crew"}
                </Button>
                <p className="mt-3 text-center text-xs leading-5 text-text-muted">
                  No request is created at this step.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function WorkOptions({
  question,
  value,
  onSelect,
  wide = false,
}: {
  question: RequirementQuestionView | null;
  value: string | null;
  onSelect: (value: string) => void;
  wide?: boolean;
}) {
  if (question === null || question.options === undefined || question.options.length === 0) {
    return (
      <ErrorState
        title="Work choices are not available"
        message="This crew service is missing its work list. Nothing has been sent; choose another service while we fix it."
        severity="error"
        inline
      />
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={question.label}
      className={cn("grid gap-3", wide ? "sm:grid-cols-2" : "grid-cols-1")}
    >
      {question.options.map((option, index) => {
        const isSelected = option.value === value;
        return (
          <label
            key={option.value}
            style={{ animationDelay: `${Math.min(index, 7) * 45}ms` }}
            className={cn(
              "crew-option-enter group relative grid min-h-[112px] cursor-pointer grid-cols-[52px_minmax(0,1fr)_24px] items-start gap-3 overflow-hidden rounded-[18px] border p-4",
              "transition-[border-color,background-color,box-shadow,transform] duration-base ease-out active:translate-y-0 active:scale-[0.99]",
              "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus-ring",
              isSelected
                ? "-translate-y-0.5 border-selected bg-selected-surface shadow-raised"
                : "border-line bg-surface shadow-card hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised",
            )}
          >
            <input
              type="radio"
              name={question.code}
              value={option.value}
              checked={isSelected}
              required={question.required}
              onChange={() => onSelect(option.value)}
              className="sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "grid size-[52px] place-items-center rounded-[14px] transition-colors duration-base",
                isSelected ? "bg-navy-900 text-signal-300" : "bg-action-surface text-navy-700",
              )}
            >
              <WorkTypeIcon code={option.value} />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold leading-5 text-text">{option.label}</span>
              {option.description ? (
                <span className="mt-1.5 block text-[13px] leading-5 text-text-secondary">
                  {option.description}
                </span>
              ) : null}
            </span>
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid size-6 place-items-center rounded-full border transition-all duration-base",
                isSelected
                  ? "scale-100 border-selected bg-selected text-white"
                  : "scale-90 border-line-strong bg-surface text-transparent group-hover:scale-100",
              )}
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
                <path d="m4.5 10.2 3.2 3.2 7.8-7.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function WorkTypeIcon({ code, className = "size-8" }: { code: string; className?: string }) {
  const common = {
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };

  switch (code) {
    case "loading-unloading":
      return <svg {...common}><path d="M4 24h24M7 24V12h12v12M19 16h5l3 4v4M11 8h8v8h-8zM8 27a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm16 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></svg>;
    case "material-shifting":
      return <svg {...common}><path d="M6 25h20M10 25l2-9h8l2 9M12 16l1-7h6l1 7M8 9h16M16 5v4" /></svg>;
    case "site-clearing":
      return <svg {...common}><path d="m8 6 8 8M15 13l-7 7M6 22l4 4M21 8v10M17 18h8l-2 8h-4l-2-8Z" /></svg>;
    case "masonry-helper":
      return <svg {...common}><path d="M5 24h22M7 24v-5h8v5M15 24v-5h10v5M10 19v-5h10v5M20 19v-5h5M8 10h16l-2-4H10l-2 4Z" /></svg>;
    case "painting-helper":
      return <svg {...common}><path d="M7 7h15v7H7zM22 10h3v6h-9v4M16 20v7M13 27h6" /></svg>;
    case "demolition-support":
      return <svg {...common}><path d="m8 7 17 17M19 6l7 7-5 5-7-7 5-5ZM6 19l7 7M5 25l4-4" /></svg>;
    case "general-labour":
      return <svg {...common}><path d="M7 25h18M10 25v-8h12v8M12 17v-4a4 4 0 0 1 8 0v4M9 13h14M14 6h4" /></svg>;
    default:
      return <svg {...common}><path d="M8 7h16v18H8zM12 12h8M12 16h8M12 20h5M5 10h3" /></svg>;
  }
}

function ProgressRail({ active }: { active: "work" | "details" | "rate" }) {
  const steps = [
    { id: "work", label: "Choose the work" },
    { id: "details", label: "Plan people & days" },
    { id: "rate", label: "Review live rate" },
  ] as const;
  const activeIndex = steps.findIndex((step) => step.id === active);
  return (
    <ol aria-label="Booking progress" className="flex flex-col gap-0">
      {steps.map((step, index) => {
        const current = step.id === active;
        const done = index < activeIndex;
        return (
          <li key={step.id} className="grid grid-cols-[30px_1fr] gap-3">
            <div className="flex flex-col items-center">
              <span className={cn("grid size-[30px] place-items-center rounded-full border text-xs font-bold", current ? "border-navy-900 bg-navy-900 text-white" : done ? "border-success-line bg-success-surface text-success-text" : "border-line bg-surface text-text-muted")}>
                {done ? <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden><path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : index + 1}
              </span>
              {index < steps.length - 1 ? <span className="h-7 w-px bg-line" /> : null}
            </div>
            <span className={cn("pt-1 text-sm", current ? "font-bold text-text" : "text-text-secondary")}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SiteBoardSignal() {
  return (
    <div aria-hidden className="relative h-36 overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.06] p-5">
      <div className="absolute inset-x-5 top-1/2 h-px bg-white/15" />
      <div className="absolute left-7 top-5 grid size-12 place-items-center rounded-[14px] bg-signal-500 text-navy-900 shadow-raised"><WorkTypeIcon code="loading-unloading" /></div>
      <div className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[14px] bg-white text-navy-800 shadow-raised"><WorkTypeIcon code="masonry-helper" /></div>
      <div className="absolute bottom-5 right-7 grid size-12 place-items-center rounded-[14px] bg-signal-100 text-navy-800 shadow-raised"><WorkTypeIcon code="painting-helper" /></div>
      <span className="absolute bottom-5 left-7 text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">Site board</span>
    </div>
  );
}

function BackArrow() {
  return <svg viewBox="0 0 20 20" fill="none" className="mr-1 size-4" aria-hidden><path d="m12 5-5 5 5 5M7 10h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
