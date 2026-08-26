"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { Logo, Sheet, cn } from "@vsolve/ui";
import { Check, ChevronLeft, ListChecks, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";

import { previousStep, progressSummary, stepProgress, type StepProgress } from "../model/progress";
import { usePartnerApplication } from "../queries";

/**
 * The chrome for `/apply/*`.
 *
 * ## What it replaces
 *
 * A horizontally scrolling strip of eight identical chips, plus a second
 * parallel strip of four more whenever the applicant wandered into the
 * specialist-work branch. Three things were wrong with it, and they compound:
 *
 * 1. **It showed no progress.** Every chip looked the same except the current
 *    one. It could not answer "how much is left" or "which of these have I
 *    done", which are the only two questions anyone asks during a long form.
 * 2. **It was a navigation you had to scroll sideways.** About three of eight
 *    chips fit on a 360px screen, so finding out where you were meant dragging a
 *    nav bar to hunt for a highlight.
 * 3. **Two strips is two hierarchies.** The specialist steps are an optional
 *    branch, not steps five to eight of the main path, and drawing them as a
 *    second row of the same thing said otherwise.
 *
 * ## What it draws instead
 *
 * A fixed header carrying one sentence — **Step 3 of 6** — over a bar that
 * fills as the record fills, and a control that opens the full list as a sheet.
 * Progress you can read at a glance, detail on demand: the same trade every
 * multi-step checkout makes, because it is the one that works on a phone.
 *
 * The count is honest about what it counts. `progressSummary` counts only steps
 * that gate a submission, so "4 of 6" and "2 things left" can never disagree —
 * see that function's own note on why the overview, the review screen and the
 * optional hours step are excluded from the denominator.
 *
 * ## Layout
 *
 * A `dvh` flex column: fixed header, scrolling body, and a slot at the bottom
 * that `ApplicationEditor` fills with its action dock. The dock is a sibling of
 * the scroll container rather than a `sticky` child of it, so the primary action
 * is pinned to the viewport on a long step — the documents step in particular
 * runs well past a phone screen — without any positioning, and without the
 * `bottom: calc(...)` arithmetic that pinning above another component's fixed
 * bar would have needed.
 */

/**
 * Where a step portals its action bar.
 *
 * A portal target rather than a `setDock(node)` callback, and that is not a
 * style preference — the callback version is an infinite loop. A step would
 * publish a freshly created element on every render, the shell would store it in
 * state, the resulting re-render would create another element, and so on. A DOM
 * node captured once by a callback ref is a stable value that never re-triggers
 * anything.
 *
 * ## Three states, not two
 *
 * `undefined` means **no shell above me** — there is no provider at all. A step
 * rendered on its own (a test, or a future screen that reuses
 * `ApplicationEditor` outside this tree) should still show its own action bar
 * rather than silently losing the only way to save. It falls back to rendering
 * in place.
 *
 * `null` means the shell is here but its container has not attached yet. That
 * lasts exactly one render, and rendering the bar in place for that one frame
 * would make it visibly jump into the dock. Nothing is drawn instead.
 *
 * An element is the steady state.
 */
const DockContext = createContext<HTMLElement | null | undefined>(undefined);

/**
 * Lets a step hand its action bar to the shell.
 *
 * The alternative — every step rendering its own sticky footer — is how five
 * screens end up with five slightly different bars and one of them forgets the
 * safe-area inset.
 */
export function useApplyDockTarget(): HTMLElement | null | undefined {
  return useContext(DockContext);
}

export function ApplyShell({ children }: { children: ReactNode }) {
  /*
    State rather than a plain ref: the children render in the same pass as this
    container, so a ref would still be `null` when they look for it and the dock
    would never appear until something else forced a second render. A callback
    ref stored in state gives that second render exactly once.
  */
  const [dockTarget, setDockTarget] = useState<HTMLElement | null>(null);
  const pathname = usePathname();

  const query = usePartnerApplication();
  // A 404 is "you have not started yet", which is a state and not a failure.
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;
  const application = isMissing ? null : (query.data ?? null);

  const steps = stepProgress(application);
  const summary = progressSummary(application);

  return (
    <DockContext.Provider value={dockTarget}>
      <div className="flex h-dvh flex-col bg-canvas">
        <ApplyHeader
          steps={steps}
          summary={summary}
          pathname={pathname}
          isLoading={query.isPending}
        />

        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain" }}
        >
          <div className="mx-auto w-full max-w-[520px] px-4 py-5 sm:px-5">{children}</div>
        </div>

        {/* Filled by whichever step is mounted. Empty and zero-height on the
            overview and the review screen, which carry their own actions. */}
        <div ref={setDockTarget} className="shrink-0 empty:hidden" />
      </div>
    </DockContext.Provider>
  );
}

function ApplyHeader({
  steps,
  summary,
  pathname,
  isLoading,
}: {
  steps: readonly StepProgress[];
  summary: ReturnType<typeof progressSummary>;
  pathname: string;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const current = steps.find((step) => step.href === normalise(pathname)) ?? null;
  // Position among the gating steps only, matching the denominator. A waypoint
  // or the optional hours step reports no position rather than a wrong one.
  const gating = steps.filter((step) => step.state === "done" || step.state === "todo");
  const position = current === null ? -1 : gating.findIndex((step) => step.href === current.href);

  const back = previousStep(pathname);

  return (
    <header
      className="shrink-0 border-b border-line bg-surface"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex w-full max-w-[520px] items-center gap-1 px-2 sm:px-3">
        {back === null ? (
          <span className="h-11 w-11" aria-hidden />
        ) : (
          <button
            type="button"
            onClick={() => router.push(back.href)}
            aria-label={`Back to ${back.label}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <ChevronLeft size={22} aria-hidden />
          </button>
        )}

        <div className="flex min-w-0 flex-1 flex-col items-center py-2">
          <Logo className="h-6 w-auto text-[0.8125rem]" />
          <p className="mt-0.5 truncate text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
            {isLoading
              ? "Your application"
              : position === -1
                ? (current?.label ?? "Your application")
                : `Step ${position + 1} of ${gating.length}`}
          </p>
        </div>

        {/*
          Leaving is a real need and it was never offered: onboarding had no exit
          at all, so somebody who opened it by mistake had the browser's back
          button and nothing else. It is a link to the overview rather than a
          sign-out — nothing is lost by stopping, because every step saves to the
          server on its own.
        */}
        <Link
          href="/apply"
          aria-label="Close and see your whole application"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-muted hover:bg-surface-sunken hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <X size={20} aria-hidden />
        </Link>
      </div>

      <ProgressBar summary={summary} isLoading={isLoading} onOpenSteps={() => setOpen(true)} />

      <StepSheet open={open} onOpenChange={setOpen} steps={steps} pathname={pathname} />
    </header>
  );
}

/**
 * How full the record is, as a bar and a sentence.
 *
 * The bar is `aria-hidden` and the sentence beside it carries the same fact in
 * words — a progress bar whose only accessible form is a `role="progressbar"`
 * with a percentage tells a screen-reader user "67%" of something unnamed.
 *
 * Renders a flat inert track while the application is still loading rather than
 * an animated indeterminate one: this bar states how much of *your* record is
 * complete, and a bar that moves before anything has been read is stating that
 * about nothing.
 */
function ProgressBar({
  summary,
  isLoading,
  onOpenSteps,
}: {
  summary: ReturnType<typeof progressSummary>;
  isLoading: boolean;
  onOpenSteps: () => void;
}) {
  const remaining = summary.total - summary.done;

  return (
    <div className="mx-auto flex w-full max-w-[520px] items-center gap-3 px-4 pb-2.5 sm:px-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span
          aria-hidden
          className="block h-1.5 overflow-hidden rounded-full bg-surface-sunken"
        >
          <span
            className="block h-full rounded-full bg-action transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: isLoading ? "0%" : `${Math.round(summary.fraction * 100)}%` }}
          />
        </span>
        <span className="truncate text-[0.6875rem] font-semibold text-text-secondary">
          {isLoading
            ? "Loading your application…"
            : remaining === 0
              ? "Everything is filled in"
              : `${remaining} ${remaining === 1 ? "thing" : "things"} still to do`}
        </span>
      </div>

      <button
        type="button"
        onClick={onOpenSteps}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-[0.75rem] font-bold text-text hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <ListChecks size={15} aria-hidden />
        All steps
      </button>
    </div>
  );
}

/**
 * The whole path, on demand.
 *
 * Every step is reachable from here, including ones that are not yet complete
 * and ones already done. Onboarding is not a wizard that locks you out of step
 * five until step four is perfect — Django accepts a partial application and the
 * applicant may fill it in any order, so the navigation says so. What it will
 * not do is imply an order that does not exist.
 */
function StepSheet({
  open,
  onOpenChange,
  steps,
  pathname,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: readonly StepProgress[];
  pathname: string;
}) {
  const here = normalise(pathname);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Your application"
      description="Fill these in any order. Everything saves as you go."
    >
      <ul className="flex list-none flex-col gap-1 p-0">
        {steps.map((step) => {
          const isCurrent = step.href === here;

          return (
            <li key={step.href}>
              <Link
                href={step.href}
                onClick={() => onOpenChange(false)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-card border px-3.5 py-2.5",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  isCurrent
                    ? "border-selected bg-selected-surface"
                    : "border-transparent hover:bg-surface-hover",
                )}
              >
                <StepMark state={step.state} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      "truncate text-[0.9375rem]",
                      isCurrent ? "font-bold text-text" : "font-semibold text-text",
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="truncate text-[0.8125rem] text-text-secondary">
                    {describe(step, isCurrent)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

/**
 * State as a shape, not only a colour.
 *
 * A done step gets a filled tick, an outstanding one an open ring, an optional
 * one a dash and a waypoint a small dot. The words beside it say the same thing,
 * so nothing here is the only carrier of meaning.
 */
function StepMark({ state }: { state: StepProgress["state"] }) {
  if (state === "done") {
    return (
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-success-text text-surface">
        <Check size={16} strokeWidth={3} aria-hidden />
      </span>
    );
  }

  if (state === "todo") {
    return (
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-action"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-line-strong text-text-muted"
    >
      <span className={state === "optional" ? "h-0.5 w-2.5 rounded-full bg-current" : "h-1.5 w-1.5 rounded-full bg-current"} />
    </span>
  );
}

function describe(step: StepProgress, isCurrent: boolean): string {
  if (step.state === "waypoint") {
    return step.href === "/apply" ? "Where everything stands" : "Check it, then send it";
  }
  if (step.state === "optional") return "Optional — you can set this later";
  if (step.state === "done") return "Done";
  if (isCurrent) return "You are here";
  return step.outstanding === 1 ? "1 thing needed" : `${step.outstanding} things needed`;
}

function normalise(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
