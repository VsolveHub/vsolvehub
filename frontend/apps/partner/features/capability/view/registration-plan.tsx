"use client";

import { Card, buttonStyles, cn, useT } from "@vsolve/ui";
import { Check, Clock } from "lucide-react";
import Link from "next/link";

import { AsyncSection, type AsyncState } from "@/components/async-section";

import type { RegistrationPlanView, RegistrationStep } from "../adapters/registration-plan";

/**
 * What is needed now, what is coming, and what is done.
 *
 * Closes the presentation half of `M2-FE-105`.
 *
 * ## Three groups, not one checklist
 *
 * A single list of everything the platform will ever want is the twenty-minute
 * form this design exists to remove — it just looks friendlier. So the screen
 * separates them by *when*:
 *
 * - **Now** carries controls. Something the Partner already asked for is waiting
 *   on it.
 * - **Later** carries no controls by default and says when it will be asked for,
 *   in the server's own words for the three progressive gates. It exists so
 *   nothing is a surprise, not so it is done today. It is deliberately muted and
 *   below the fold.
 * - **Done** is collapsed. A tick beside every satisfied obligation is how a
 *   checklist becomes the screen instead of the work being the screen.
 *
 * An unsatisfied gate is never in "Now". `assert_kyc_complete` guards accepting
 * a first enquiry, not reading a page, and putting it at the top here would be
 * the flow-weight regression `FLOW-06` exists to prevent.
 *
 * ## The empty state is the good one
 *
 * A Partner with nothing outstanding and nothing pending sees a single sentence,
 * not an empty container. That is a real and desirable state, and rendering it
 * as "no results" would make finishing look like failing.
 */

export interface RegistrationPlanProps {
  readonly state: AsyncState<RegistrationPlanView>;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function RegistrationPlan({ state, onRetry, className }: RegistrationPlanProps) {
  const t = useT();
  return (
    <AsyncSection
      state={state}
      label={t("me.capability.plan.loading")}
      onRetry={onRetry}
      className={className}
    >
      {(plan) => (
        <div className={cn("flex flex-col gap-4", className)}>
          {plan.now.length > 0 ? (
            <Card aria-live="polite" className="p-5">
              <h2 className="text-base font-semibold text-text">
                {t("me.capability.plan.nowHeading", { count: plan.now.length })}
              </h2>
              <ul className="mt-3 flex list-none flex-col gap-4 p-0">
                {plan.now.map((entry) => (
                  <li key={entry.key}>
                    <StepRow entry={entry} tone="now" />
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card className="p-5">
              <h2 className="text-base font-semibold text-text">{t("me.capability.plan.nothingNeededTitle")}</h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                {plan.isComplete
                  ? t("me.capability.plan.nothingNeededCompleteBody")
                  : t("me.capability.plan.nothingNeededPendingBody")}
              </p>
            </Card>
          )}

          {plan.later.length > 0 ? (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                {t("me.capability.plan.laterHeading")}
              </h2>
              <ul className="mt-2 flex list-none flex-col gap-3 p-0">
                {plan.later.map((entry) => (
                  <li key={entry.key}>
                    <StepRow entry={entry} tone="later" />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {plan.done.length > 0 ? (
            <details className="rounded-card border border-line bg-surface p-4">
              <summary className="cursor-pointer text-sm font-semibold text-text">
                {t("me.capability.plan.doneHeading", { count: plan.done.length })}
              </summary>
              <ul className="mt-3 flex list-none flex-col gap-2 p-0">
                {plan.done.map((entry) => (
                  <li key={entry.key} className="flex items-start gap-2 text-sm text-text-secondary">
                    <Check
                      size={16}
                      aria-hidden
                      className="mt-0.5 shrink-0 text-success-text"
                      strokeWidth={3}
                    />
                    <span>{entry.title}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </AsyncSection>
  );
}

function StepRow({ entry, tone }: { entry: RegistrationStep; tone: "now" | "later" }) {
  const isNow = tone === "now";

  return (
    <div className={cn(isNow ? "" : "rounded-card bg-surface-sunken px-4 py-3")}>
      <p
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          isNow ? "text-text" : "text-text-secondary",
        )}
      >
        {isNow ? null : <Clock size={14} aria-hidden className="shrink-0 text-text-muted" />}
        {entry.title}
      </p>
      {/* For the three gates this is Django's own sentence, unedited — the same
          one that arrives on the 403 if the Partner gets there first. */}
      <p className="mt-1 text-sm leading-6 text-text-secondary">{entry.why}</p>

      {/* A "later" row carries no button. Offering one would turn a heads-up into
          a demand, which is precisely the wall this plan replaces. */}
      {isNow && entry.href && entry.actionLabel ? (
        <Link href={entry.href} className={buttonStyles({ size: "sm", className: "mt-3" })}>
          {entry.actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
