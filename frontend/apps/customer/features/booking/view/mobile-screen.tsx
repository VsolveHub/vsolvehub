"use client";

import { cn } from "@vsolve/ui";
import { useEffect, useLayoutEffect, type ReactNode } from "react";

import { claimViewport } from "@/lib/focus-mode";

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * The claim has to land *before* the browser paints, or the site header shows
 * for one frame above a screen that is replacing it — which on a phone is a
 * visible jump of the whole page. `useLayoutEffect` is the hook that runs then.
 * React warns when it is called during server rendering, where there is no
 * layout to read, so the server gets the harmless one.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The phone shell: a header that does not move, one scrolling region, and an
 * action that does not move.
 *
 * ## What it is fixing
 *
 * The shipped booking screens are a desktop layout rendered at phone width. The
 * consequence that mattered most was not aesthetic: the primary action sat below
 * the fold, so the customer had to scroll past every disclosure to reach it, and
 * on a screen whose whole job is one decision that is the decision hidden.
 *
 * So the action is docked. Everything else scrolls between two fixed edges,
 * which is the shape every native booking flow on this platform already has and
 * the shape a customer standing in a doorway can operate one-handed.
 *
 * ## `100dvh`, not `100vh`
 *
 * Mobile Safari's `vh` is the viewport *without* the collapsing address bar, so a
 * `100vh` column is taller than the screen and the docked footer sits below the
 * fold — the exact bug this shell exists to remove, reintroduced by the unit.
 * `dvh` tracks the visible viewport as the bar collapses.
 *
 * ## The footer's padding is not a magic number
 *
 * `env(safe-area-inset-bottom)` is the home indicator on a gesture-navigation
 * phone. Without it the button's lower half is under the system bar and taps
 * land on the OS rather than on the button. `max()` keeps a sensible floor on
 * devices that report no inset.
 */

export interface MobileScreenProps {
  /** The header title. Truncates rather than wrapping — the header is one line. */
  title: string;
  /** Back affordance. Omit on a screen with nowhere to go back to. */
  onBack?: () => void;
  /** Trailing header slot: step text. Mutually exclusive with `badge`. */
  step?: string;
  /** Trailing header slot: a status pill. Mutually exclusive with `step`. */
  badge?: ReactNode;
  /** A trailing text link, for "Done" or "Skip". Where neither step nor badge fits. */
  headerAction?: ReactNode;
  /**
   * A progress meter under the title row, for a multi-step flow.
   *
   * A prop rather than a second shell, because everything else about the header
   * — the height, the back target, the truncation, the trailing slot — is
   * identical, and two shells would drift the first time one of those changed.
   */
  meter?: ReactNode;
  /** The docked action. Usually a `Button` with `block`. */
  action?: ReactNode;
  /**
   * One line of reassurance next to the action.
   *
   * `above` for the promise that makes the action safe to press — "Free.
   * Nothing is booked yet." — because it has to be read *before* the tap.
   * `below` for what happens next after it, which is context rather than
   * consent.
   */
  reassurance?: string;
  reassurancePosition?: "above" | "below";
  children: ReactNode;
}

export function MobileScreen({
  title,
  onBack,
  step,
  badge,
  headerAction,
  meter,
  action,
  reassurance,
  reassurancePosition = "above",
  children,
}: MobileScreenProps) {
  // This screen owns the viewport while it is open, so the app's navigation
  // steps aside — two headers and a set of links out of a flow the customer is
  // three taps into is the defect this closes.
  useIsomorphicLayoutEffect(() => claimViewport(), []);

  const reassuranceLine =
    reassurance === undefined ? null : (
      <p className="text-center text-xs leading-5 text-text-muted">{reassurance}</p>
    );

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <header className="sticky top-0 z-20 shrink-0 border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-1 px-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            // 36px glyph area inside a 44px row: the row is the target, so the
            // touch rule is met without a chevron the size of a thumbnail.
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover hover:text-text"
          >
            <span className="sr-only">Back</span>
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M12.5 4.5 7 10l5.5 5.5" />
            </svg>
          </button>
        ) : (
          <span aria-hidden className="h-9 w-2 shrink-0" />
        )}

        <h1 className="min-w-0 flex-1 truncate px-1 text-[15px] font-bold text-text">
          {title}
        </h1>

        <div className="flex shrink-0 items-center pr-1">
          {step !== undefined ? (
            <span className="text-xs font-semibold text-text-muted">{step}</span>
          ) : null}
          {badge}
          {headerAction}
        </div>
        </div>
        {meter}
      </header>

      <main className="flex flex-1 flex-col gap-4 overflow-y-auto px-3.5 py-4">
        {children}
      </main>

      {action !== undefined || reassurance !== undefined ? (
        <footer
          className={cn(
            "sticky bottom-0 z-20 shrink-0 border-t border-line bg-surface px-3.5 pt-3",
            "pb-[max(1rem,env(safe-area-inset-bottom))]",
          )}
        >
          <div className="flex flex-col gap-2">
            {reassurancePosition === "above" ? reassuranceLine : null}
            {action}
            {reassurancePosition === "below" ? reassuranceLine : null}
          </div>
        </footer>
      ) : null}
    </div>
  );
}

/**
 * The screen's own heading block: an eyebrow and the question being asked.
 *
 * Separate from the header's title, which is the *place* — "Book a crew" — where
 * this is the *question* — "Tell us the job". A phone header is one truncating
 * line and cannot carry both, and collapsing them loses the one that orients
 * somebody who arrived from a notification.
 */
export function ScreenHeading({
  eyebrow,
  title,
}: {
  eyebrow?: string;
  title: string;
}) {
  return (
    <div>
      {eyebrow !== undefined ? (
        <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-text-muted">
          {eyebrow}
        </p>
      ) : null}
      {/* `h2`, not `h1` — the shell's header owns the page's one `h1`. */}
      <h2 className="mt-1 text-[21px] font-bold leading-[26px] tracking-[-0.015em] text-text">
        {title}
      </h2>
    </div>
  );
}

/** A field label at the density the phone screens use. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[13px] font-semibold text-text">{children}</p>;
}
