import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * The docked foot of a task screen: what it costs, and the one thing to do next.
 *
 * Every screen in a multi-step flow ends the same way, and the running total has
 * to stay visible while the list above it scrolls — a partner who has to scroll
 * back up to check what they have priced will stop trusting the number. So the
 * amount lives here rather than at the end of the list.
 *
 * `pb-[max(1rem,env(safe-area-inset-bottom))]` rather than a fixed padding: on a
 * phone with a home indicator the action would otherwise sit under it, and on
 * one without, a hardcoded 34px leaves a dead band. The `max()` gives whichever
 * is larger and nothing on either device.
 *
 * One action. If a screen appears to need two equal primary buttons, one of them
 * is not primary (plan 03) — pass a secondary as `children` alongside, and let
 * the primary carry the weight.
 */

export interface StepDockProps {
  /** Names the amount, e.g. "Items total · labour only". Omit for an action-only dock. */
  label?: string;
  /** The running figure. Pass a formatted string; this component does no arithmetic. */
  amount?: ReactNode;
  /** The action row. Usually one Button with `block`. */
  children: ReactNode;
  /**
   * One line under the action. Use it for the reassurance or the reason the
   * action is disabled — never for a legal disclosure, which belongs in the body
   * where it cannot be scrolled past.
   */
  caption?: ReactNode;
  className?: string;
}

export function StepDock({ label, amount, children, caption, className }: StepDockProps) {
  const hasAmount = label !== undefined || amount !== undefined;

  return (
    <footer
      className={cn(
        "sticky bottom-0 z-20 shrink-0 border-t border-line bg-surface",
        "px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]",
        "shadow-[0_-4px_12px_rgb(69_63_55/0.06)]",
        className,
      )}
    >
      <div className="flex flex-col gap-2.5">
        {hasAmount ? (
          <div className="flex items-baseline justify-between gap-3">
            {label !== undefined ? (
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
                {label}
              </span>
            ) : null}
            {amount !== undefined ? (
              <span
                aria-live="polite"
                className="text-[1.625rem] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-text"
              >
                {amount}
              </span>
            ) : null}
          </div>
        ) : null}

        {children}

        {caption !== undefined ? (
          <p className="text-center text-xs font-medium leading-5 text-text-muted">{caption}</p>
        ) : null}
      </div>
    </footer>
  );
}
