"use client";

import { cn } from "@vsolve/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { APPLICATION_STEPS, stepIndexOf } from "../model/steps";

/**
 * The `/apply/*` step strip.
 *
 * Session handling used to live here — a login form, a "loading your
 * application" state and an error card, all duplicated on two other screens.
 * All three now belong to `PartnerShell` in this route's layout, which also
 * carries the header this once drew. No role is required there, deliberately:
 * `PATCH /api/v1/partner/application/` is `IsAuthenticated` and nothing more,
 * because someone applying to be a Partner does not have the Partner role yet.
 *
 * What is left is the one thing only onboarding has: where you are in it.
 */
export function ApplyShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4">
      <ApplySteps />
      <main className="mt-6">{children}</main>
    </div>
  );
}

/**
 * The step navigation.
 *
 * Marks where the applicant is, which an earlier version did not: every step
 * looked identical, so after a save there was no way to tell you had moved —
 * and no way to tell you had not. `aria-current="page"` carries that to a screen
 * reader; the fill and weight carry it visually.
 */
function ApplySteps() {
  const pathname = usePathname();
  const currentIndex = stepIndexOf(pathname);

  return (
    /* Horizontal on a phone, so the whole path stays visible without the steps
       shrinking to unreadable. */
    <nav aria-label="Application steps" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex list-none gap-1 p-0">
        {APPLICATION_STEPS.map((step, index) => {
          const isCurrent = index === currentIndex;
          return (
            <li key={step.href}>
              <Link
                href={step.href}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-control px-3 text-sm font-semibold",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
                  isCurrent
                    ? "bg-selected-surface text-text"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text",
                )}
              >
                {step.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
