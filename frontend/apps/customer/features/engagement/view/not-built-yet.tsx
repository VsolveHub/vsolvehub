"use client";

import { cn } from "@vsolve/ui";

/**
 * A part of this screen that genuinely does not exist yet, said out loud.
 *
 * Three Wave A3 tasks are deliberately out of scope — `M2-FE-510` (one-tap
 * attendance, which needs C4's attendance model), `M2-FE-611` (deliverable
 * acceptance, warranty and the retention release date) and `M2-FE-612` (the
 * vendor-replacement path), the last two needing C5. Half-building any of them
 * would be worse than not building them: an attendance control wired to nothing
 * teaches somebody that confirming does nothing, and a retention date invented
 * by this client is a promise the platform has not made.
 *
 * The remaining choice is between rendering nothing and rendering this. Nothing
 * is what a Customer reads as "this product does not do that" — and on the
 * warranty panel, as "I have no cover". So the space says what will be here,
 * what to do in the meantime, and it never offers a control.
 *
 * This component is deleted when the three tasks land. It is deliberately ugly
 * to leave in place.
 */

export interface NotBuiltYetProps {
  title: string;
  /** What it will do, and the honest thing to do until it does. */
  body: string;
  /** The task that closes it, so this block is traceable to a plan row. */
  taskId: string;
  className?: string;
}

export function NotBuiltYet({ title, body, taskId, className }: NotBuiltYetProps) {
  return (
    <section
      className={cn(
        "rounded-card border border-dashed border-line bg-surface-sunken p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-text">{title}</h2>
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Not available yet
        </p>
      </div>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">{body}</p>
      <p className="sr-only">Tracked as {taskId}.</p>
    </section>
  );
}
