"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { Logo, Sheet, cn, useT, type Translator } from "@vsolve/ui";
import { Check, ChevronLeft, CircleHelp, ListChecks } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { NotificationBell } from "@/features/notifications/view/notification-bell";

import { previousStep, stepProgress, type StepProgress } from "../model/progress";
import { usePartnerApplication, usePartnerAvailability } from "../queries";
import { AccountButton, HelpSheet } from "./account-menu";

/**
 * The chrome for `/apply/*`: one header, one scrolling column, one action bar.
 *
 * The header says where you are ("Step 2 of 5"), gives one step back, and holds the four
 * things a Partner may need on any screen — the step list, help, their notifications and their
 * account. Registration works the same on a phone and on a desktop, so there is one layout: a
 * single column that is comfortable at 360px and simply centred on a wide screen.
 *
 * The action bar is a sibling of the scroll container rather than a `sticky` child of it, so the
 * primary action stays pinned to the viewport on a long step without any positioning arithmetic.
 * Every step puts its actions there through `ApplyDock`.
 */

/**
 * Where a step portals its action bar.
 *
 * `undefined` means there is no shell above (a test, or a screen rendered on its own): the bar
 * renders in place rather than losing the only way to continue. `null` means the shell's
 * container has not attached yet — one render — and nothing is drawn, so the bar does not jump.
 */
const DockContext = createContext<HTMLElement | null | undefined>(undefined);

export function useApplyDockTarget(): HTMLElement | null | undefined {
  return useContext(DockContext);
}

/** The one bottom action bar every onboarding step uses. */
export function ApplyDock({ children }: { children: ReactNode }) {
  const target = useApplyDockTarget();
  const dock = (
    <div
      className="shrink-0 border-t border-line bg-surface/95 shadow-lg backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-3.5 py-3 sm:px-6">{children}</div>
    </div>
  );
  if (target === undefined) return dock;
  if (target === null) return null;
  return createPortal(dock, target);
}

export function ApplyShell({ children }: { children: ReactNode }) {
  const [dockTarget, setDockTarget] = useState<HTMLElement | null>(null);

  return (
    <DockContext.Provider value={dockTarget}>
      <div className="relative min-h-dvh bg-canvas text-text">
        <ApplyHeader />

        <main className="mx-auto w-full max-w-3xl px-3.5 pb-[calc(9.5rem+env(safe-area-inset-bottom,0px))] pt-20 sm:px-6 sm:pt-24">
          {children}
        </main>

        <div ref={setDockTarget} className="fixed inset-x-0 bottom-0 z-40 empty:hidden" />
      </div>
    </DockContext.Provider>
  );
}

function ApplyHeader() {
  const t = useT();
  const router = useRouter();
  const pathname = normalise(usePathname());
  const [stepsOpen, setStepsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const query = usePartnerApplication();
  const availability = usePartnerAvailability();
  // A 404 is "you have not started yet", which is a state and not a failure.
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;
  const application = isMissing ? null : (query.data ?? null);
  const track = application?.track ?? null;

  // While the application is with a reviewer there is no path to walk, only a status to read.
  const canWalkSteps = application === null || application.can_edit;
  const steps = stepProgress(application, availability.data);
  const path = steps.filter((step) => step.state !== "waypoint");
  const position = path.findIndex((step) => step.href === pathname);
  const back = canWalkSteps ? previousStep(pathname, track) : null;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-1.5 px-3 sm:gap-2 sm:px-6">
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {back !== null ? (
              <button
                type="button"
                onClick={() => router.push(back.href)}
                aria-label={t("apply.shell.backTo", { label: t(back.labelKey) })}
                className="grid h-10 w-10 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-control text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
            ) : null}

            <Link href="/apply" aria-label={t("apply.steps.overview")} className="flex min-h-10 sm:min-h-11 shrink-0 items-center">
              <Logo hideWordmarkOnMobile className="h-6 w-auto sm:h-7" />
            </Link>
          </div>

          <p className="min-w-0 flex-1 px-1 truncate text-center text-xs sm:text-sm font-semibold text-text-secondary">
            {position >= 0 && canWalkSteps
              ? t("apply.shell.stepOf", { n: position + 1, total: path.length })
              : null}
          </p>

          <div className="flex shrink-0 items-center gap-0.5">
            {canWalkSteps ? (
              <button
                type="button"
                onClick={() => setStepsOpen(true)}
                aria-label={t("apply.shell.stepsButton")}
                className={headerIconClass}
              >
                <ListChecks size={20} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label={t("apply.help.title")}
              className={cn(headerIconClass, "hidden sm:grid")}
            >
              <CircleHelp size={20} aria-hidden />
            </button>
            <NotificationBell workspaceKeys={[]} />
            <AccountButton application={application} onOpenHelp={() => setHelpOpen(true)} />
          </div>
        </div>
      </header>

      <StepSheet open={stepsOpen} onOpenChange={setStepsOpen} steps={path} pathname={pathname} />
      <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}

const headerIconClass = cn(
  "grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-control text-text-secondary",
  "hover:bg-surface-hover hover:text-text",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
);

/**
 * The whole path, on demand. Every step is reachable from here: Django accepts a partial
 * application in any order, so the navigation does not pretend there is a lock.
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("apply.shell.sheet.title")}>
      <ul className="flex list-none flex-col gap-1 p-0">
        {steps.map((step) => {
          const isCurrent = step.href === pathname;
          return (
            <li key={step.href}>
              <Link
                href={step.href}
                onClick={() => onOpenChange(false)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-card border px-3.5 py-2.5",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  isCurrent ? "border-selected bg-selected-surface" : "border-transparent hover:bg-surface-hover",
                )}
              >
                <StepMark state={step.state} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[0.9375rem] font-semibold text-text">{t(step.labelKey)}</span>
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

/** State as a shape, not only a colour: a tick, an open ring or a dash, with words beside it. */
export function StepMark({ state }: { state: StepProgress["state"] }) {
  if (state === "done") {
    return (
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-success-text text-surface">
        <Check size={16} strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (state === "todo") {
    return <span aria-hidden className="h-7 w-7 shrink-0 rounded-full border-2 border-action" />;
  }
  return (
    <span
      aria-hidden
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-line-strong text-text-muted"
    >
      <span className="h-0.5 w-2.5 rounded-full bg-current" />
    </span>
  );
}

function describe(step: StepProgress, isCurrent: boolean, t: Translator["t"]): string {
  if (step.state === "optional") return t("apply.shell.describe.optional");
  if (step.state === "done") return t("common.done");
  if (isCurrent) return t("apply.shell.describe.current");
  return t("apply.shell.describe.outstanding", { count: step.outstanding });
}

function normalise(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
