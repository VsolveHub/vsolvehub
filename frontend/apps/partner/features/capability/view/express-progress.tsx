"use client";

import { Card, buttonStyles, cn } from "@vsolve/ui";
import { Check } from "lucide-react";
import Link from "next/link";

import type { ExpressPathView } from "../adapters/express-path";

/**
 * The short way in, shown as four short steps and one button.
 *
 * Closes the presentation half of `M2-FE-101`.
 *
 * ## Why the whole path is visible from the first screen
 *
 * The thing that loses people in onboarding is not any single step, it is not
 * knowing how many there are. A progress bar answers "how far" and refuses to
 * answer "how much longer", which is the question being asked. Four named rows
 * with the remaining count stated in words is the smallest honest answer, and it
 * is what lets someone decide to start now rather than "later".
 *
 * Each row says what it asks for, in the Partner's terms — "Pick one thing you
 * do", not "Service selection". A person deciding whether to give a stranger
 * their phone number is reading for cost, not for field names.
 *
 * ## Why completed steps stay tappable
 *
 * Someone who mistyped their name needs to go back, and a checklist that locks
 * finished rows forces them to guess which navigation gets them there. The next
 * step is the one the button goes to; the rows are simply where things live.
 *
 * ## Nothing here is a promise of approval
 *
 * Finishing this earns a look at *masked* demand. It is not KYC, it does not
 * approve a capability, and the copy on the final button says so — an "all done"
 * at the end of four screens is how someone concludes they are verified and then
 * finds out otherwise at their first accept.
 */

export interface ExpressProgressProps {
  readonly path: ExpressPathView;
  readonly className?: string;
}

export function ExpressProgress({ path, className }: ExpressProgressProps) {
  const done = path.steps.filter((step) => step.isComplete).length;

  return (
    <Card className={cn("p-5", className)}>
      <h2 className="text-base font-semibold text-text">Start taking work</h2>
      <p className="mt-1 text-sm text-text-secondary">
        {path.canSeeDemand
          ? "You are set up. Here is what people near you are asking for."
          : `Four short steps. ${path.remaining} to go.`}
      </p>

      <ol
        className="mt-4 flex list-none flex-col gap-1 p-0"
        aria-label={`Setup steps, ${done} of ${path.steps.length} done`}
      >
        {path.steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              aria-current={step.isCurrent ? "step" : undefined}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-control px-3 py-2 transition-colors duration-fast",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
                step.isCurrent ? "bg-selected-surface" : "hover:bg-surface-hover",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  step.isComplete
                    ? "bg-success-surface text-success-text"
                    : "bg-surface-sunken text-text-muted ring-1 ring-line",
                )}
              >
                {step.isComplete ? <Check size={14} strokeWidth={3} /> : null}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm font-semibold",
                    step.isComplete ? "text-text-secondary" : "text-text",
                  )}
                >
                  {step.label}
                </span>
                {/* The ask is what makes the step decidable, so it stays on the
                    finished rows too — someone re-reading the list is usually
                    checking what they already gave. */}
                <span className="block text-xs leading-5 text-text-muted">{step.ask}</span>
              </span>

              {step.isComplete ? (
                <span className="sr-only">Done</span>
              ) : (
                <span className="sr-only">Not done yet</span>
              )}
            </Link>
          </li>
        ))}
      </ol>

      <Link href={path.destination} className={buttonStyles({ size: "lg", block: true, className: "mt-5" })}>
        {path.canSeeDemand ? "See what people need" : "Continue"}
      </Link>

      {path.canSeeDemand ? null : (
        <p className="mt-3 text-xs leading-5 text-text-muted">
          We ask for documents later, when you accept your first job — not now.
        </p>
      )}
    </Card>
  );
}
