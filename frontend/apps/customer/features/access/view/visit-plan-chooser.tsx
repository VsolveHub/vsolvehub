"use client";

import { Skeleton, cn } from "@vsolve/ui";
import type { ReactNode } from "react";

import type { PlanTierView } from "../adapters";
import { AccessRefusal } from "./access-refusal";

export interface VisitPlanChooserProps {
  tiers: readonly PlanTierView[];
  chosenPlanSize: number | null;
  locked: boolean;
  isLoading: boolean;
  readError: unknown;
  onRetryRead: () => void;
  onChoose: (planSize: number) => void;
  isChoosing: boolean;
  chooseError: unknown;
  supportAction?: ReactNode;
}

export function VisitPlanChooser({
  tiers,
  chosenPlanSize,
  locked,
  isLoading,
  readError,
  onRetryRead,
  onChoose,
  isChoosing,
  chooseError,
  supportAction,
}: VisitPlanChooserProps) {
  return (
    <section
      data-visit-plan-chooser
      className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
      aria-labelledby="plan-heading"
    >
      <div className="bg-action-surface px-4 py-4 sm:px-5">
        <div className="flex items-center gap-4">
          <VisitSignal count={chosenPlanSize} active={isChoosing} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase text-action-active">Site visits</p>
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-success-text">
                No payment now
              </span>
            </div>
            <h3 id="plan-heading" className="mt-1 text-lg font-extrabold text-text">
              How many estimates do you want?
            </h3>
            <p className="mt-1 text-sm font-medium leading-5 text-text-secondary">
              Each professional measures the site and prices it in writing.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {isLoading ? (
          <div className="grid gap-2 sm:grid-cols-3" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading visit options</span>
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-32 w-full" />
            ))}
          </div>
        ) : readError !== null && readError !== undefined ? (
          <AccessRefusal
            error={readError}
            attempting="choose how many professionals visit"
            supportAction={supportAction}
            onRetry={onRetryRead}
          />
        ) : tiers.length === 0 ? (
          <div className="text-sm leading-6 text-text-secondary">
            <p>No priced site-visit plans are available for this request yet.</p>
            {supportAction ? <div className="mt-3">{supportAction}</div> : null}
          </div>
        ) : locked ? (
          <div className="flex items-center gap-3 rounded-card border border-success-line bg-success-surface px-4 py-3">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-success-text">
              <CheckIcon />
            </span>
            <div>
              <p className="text-sm font-extrabold text-text">
                {chosenPlanSize ?? tiers[0]?.planSize} visit{(chosenPlanSize ?? tiers[0]?.planSize) === 1 ? "" : "s"} confirmed
              </p>
              <p className="mt-0.5 text-xs font-medium text-text-secondary">
                A professional has committed, so this plan is now fixed.
              </p>
            </div>
          </div>
        ) : (
          <div
            className="grid gap-2 sm:grid-cols-3"
            role="radiogroup"
            aria-labelledby="plan-heading"
            aria-busy={isChoosing}
          >
            {tiers.map((tier) => {
              const isChosen = chosenPlanSize === tier.planSize;
              return (
                <button
                  key={tier.planSize}
                  type="button"
                  role="radio"
                  aria-checked={isChosen}
                  disabled={isChoosing}
                  onClick={() => onChoose(tier.planSize)}
                  className={cn(
                    "relative flex min-h-32 cursor-pointer flex-col items-start rounded-card border px-3 py-3 text-left",
                    "transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                    "disabled:cursor-wait disabled:opacity-70",
                    isChosen
                      ? "border-action-line bg-action-surface"
                      : "border-line bg-surface hover:border-line-strong hover:bg-surface-hover",
                  )}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span data-numeric className="text-2xl font-extrabold text-text">
                      {tier.planSize}
                    </span>
                    {isChosen ? (
                      <span className="grid size-6 place-items-center rounded-full bg-action text-action-text">
                        {isChoosing ? <LoadingIcon /> : <CheckIcon />}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 text-sm font-extrabold text-text">
                    {tier.planSize === 1 ? "professional" : "professionals"}
                  </span>
                  <span data-numeric className="mt-auto pt-3 text-sm font-bold text-text">
                    {tier.priceLabel}
                  </span>
                  <span className="mt-0.5 text-xs font-medium text-text-muted">
                    {tier.planSize > 1 ? "Unused visits refunded" : "Refunded if it never happens"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {chosenPlanSize !== null && !locked && tiers.length > 0 ? (
          <p className="mt-3 text-xs font-medium text-text-secondary" role="status">
            Change this until the first professional confirms a time.
          </p>
        ) : null}

        <div className="mt-3">
          <AccessRefusal
            error={chooseError}
            attempting="choose how many professionals visit"
            supportAction={supportAction}
          />
        </div>
      </div>
    </section>
  );
}

function VisitSignal({ count, active }: { count: number | null; active: boolean }) {
  const visible = Math.min(Math.max(count ?? 3, 1), 3);

  return (
    <span
      aria-hidden
      className="relative grid size-16 shrink-0 place-items-center rounded-full border border-action-line bg-surface"
    >
      <span
        className={cn(
          "absolute inset-2 rounded-full border border-action-line",
          active ? "animate-ping opacity-40 motion-reduce:animate-none" : null,
        )}
      />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-6 text-action-active">
        <path d="M5 20v-7l7-5 7 5v7M9 20v-4h6v4M8 7V4h8v3" />
      </svg>
      {Array.from({ length: visible }, (_, index) => (
        <span
          key={index}
          className={cn(
            "absolute size-2 rounded-full bg-action",
            index === 0 ? "left-1 top-7" : index === 1 ? "right-1 top-7" : "left-7 top-1",
          )}
        />
      ))}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="m5 12 4 4 10-10" />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-4 animate-spin motion-reduce:animate-none">
      <path d="M20 12a8 8 0 1 1-3-6.2" />
    </svg>
  );
}
