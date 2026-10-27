"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { Logo, Sheet, cn, useT, type Translator } from "@vsolve/ui";
import { Check, ChevronLeft, ListChecks } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";

import { previousStep, progressSummary, stepProgress, type StepProgress } from "../model/progress";
import { usePartnerApplication } from "../queries";
import { HomeHeroLink } from "@/components/home-hero-link";
import { LocaleSwitcher } from "@/features/session/view/locale-switcher";

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
      <div className="relative min-h-dvh bg-canvas text-text">
        <ApplyHeader
          steps={steps}
          summary={summary}
          pathname={pathname}
          isLoading={query.isPending}
          status={application?.status ?? null}
        />

        <main className="mx-auto w-full max-w-2xl lg:max-w-5xl xl:max-w-6xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 lg:pt-32 pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]">
          {children}
        </main>

        {/* Portaled action bar from ApplicationEditor — fixed above the home indicator. */}
        <div ref={setDockTarget} className="fixed inset-x-0 bottom-0 z-40 empty:hidden" />
      </div>
    </DockContext.Provider>
  );
}

function ApplyHeader({
  steps,
  summary: _summary,
  pathname,
  isLoading: _isLoading,
  status,
}: {
  steps: readonly StepProgress[];
  summary: ReturnType<typeof progressSummary>;
  pathname: string;
  isLoading: boolean;
  status: string | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const isSubmitted = status === "SUBMITTED" || status === "UNDER_REVIEW";
  const back = isSubmitted ? null : previousStep(pathname);
  const currentStepIdx = steps.findIndex((s) => s.href === pathname);

  return (
    <>
      {/* Floating Dynamic-Island Navigation Matching Homepage */}
      <div className="fixed top-3 inset-x-0 z-50 px-3 sm:px-6 pointer-events-none">
        <header className="pointer-events-auto mx-auto max-w-6xl xl:max-w-7xl rounded-2xl sm:rounded-full bg-white/95 backdrop-blur-2xl border border-line-strong shadow-[0_12px_32px_rgba(0,17,46,0.12),0_1px_3px_rgba(0,0,0,0.05)] px-3.5 sm:px-5 py-2.5 transition-all duration-300">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Brand & Live Demand Tag */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {back !== null && (
                <button
                  type="button"
                  onClick={() => router.push(back.href)}
                  aria-label={t("apply.shell.backTo", { label: t(back.labelKey) })}
                  className="grid h-11 w-11 sm:h-8 sm:w-8 place-items-center rounded-full bg-surface-sunken text-navy-900 border border-line-strong hover:bg-surface transition-colors shrink-0"
                >
                  <ChevronLeft size={18} aria-hidden />
                </button>
              )}

              <Link href="/apply" className="flex min-h-11 items-center gap-2 group shrink-0">
                <Logo className="h-6 sm:h-7 w-auto shrink-0" />
              </Link>

              {/* Live Demand Status Badge */}
              <div className="hidden xl:flex items-center gap-2 rounded-full bg-surface-sunken border border-line px-2.5 py-1 text-[11px] shrink-0">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                </span>
                <span className="text-text-secondary font-medium">{t("auth.login.nowOnboarding")}</span>
                <span className="text-navy-900 font-bold">{t("auth.login.city")}</span>
              </div>
            </div>

            {/* Desktop Center Step Status Capsule */}
            <div className="hidden lg:flex items-center gap-2 rounded-full bg-surface-sunken/80 border border-line-strong px-4 py-1.5 text-xs">
              <span className="font-extrabold text-navy-900">
                {isSubmitted
                  ? "Application Submitted • Under Verification"
                  : pathname === "/apply"
                  ? "Registration Hub"
                  : currentStepIdx >= 0
                  ? `Step ${currentStepIdx + 1} of ${steps.length}`
                  : "Partner Application"}
              </span>
              <span className="text-text-muted">•</span>
              <span className="font-medium text-text-secondary">Desktop Verification Mode</span>
            </div>

            {/* Right Action: Step indicator pill / Overview CTA & Locale */}
            <div className="flex items-center gap-2 shrink-0">
              <LocaleSwitcher />

              {!isSubmitted && (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="inline-flex min-h-11 sm:min-h-8 sm:h-8 items-center gap-1.5 rounded-full bg-surface-sunken border border-line-strong px-2.5 sm:px-3 text-xs font-bold text-navy-900 hover:bg-surface transition-colors shadow-xs"
                >
                  <ListChecks size={14} aria-hidden />
                  <span>{t("apply.shell.stepsButton")}</span>
                </button>
              )}

              <Link
                href="/apply"
                className="hidden sm:inline-flex text-xs font-bold text-navy-900 hover:text-navy-950 bg-surface-sunken hover:bg-surface px-3.5 py-1.5 rounded-full border border-line-strong transition-colors"
              >
                {t("apply.steps.overview")}
              </Link>
            </div>
          </div>
        </header>
      </div>

      <StepSheet open={open} onOpenChange={setOpen} steps={steps} pathname={pathname} />
    </>
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
  const t = useT();
  const here = normalise(pathname);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("apply.shell.sheet.title")}
      description={t("apply.shell.sheet.description")}
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
                    {t(step.labelKey)}
                  </span>
                  <span className="truncate text-[0.8125rem] text-text-secondary">
                    {describe(step, isCurrent, t)}
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

function describe(step: StepProgress, isCurrent: boolean, t: Translator["t"]): string {
  if (step.state === "waypoint") {
    return step.href === "/apply" ? t("apply.shell.describe.overview") : t("apply.shell.describe.review");
  }
  if (step.state === "optional") return t("apply.shell.describe.optional");
  if (step.state === "done") return t("common.done");
  if (isCurrent) return t("apply.shell.describe.current");
  return t("apply.shell.describe.outstanding", { count: step.outstanding });
}

function normalise(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
