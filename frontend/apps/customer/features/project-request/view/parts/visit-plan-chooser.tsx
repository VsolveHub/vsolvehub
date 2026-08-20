"use client";

import { EmptyState, Skeleton, cn } from "@vsolve/ui";
import { useId } from "react";

import type { PlanTierView } from "@/features/access/adapters";

/**
 * How many professionals should visit — the one control on the review screen.
 *
 * ## Why it is a control and not a fifth step
 *
 * The brief is budgeted at four screens. This is a decision the customer makes
 * while looking at what they are about to send, not a step they walk through —
 * and choosing **charges nothing**: it bounds the invitation wave and snapshots
 * the price, and the money is taken later, once, when the first professional
 * confirms a time.
 *
 * ## The prices are the server's, and an empty list is the honest answer
 *
 * `available_tiers` is what Operations has priced. **49 / 99 / 199 are proposed
 * figures in a planning document and this component will not print them**: if no
 * tier is published, nothing can be sold here and the panel says so rather than
 * showing a price nobody approved.
 *
 * The sizes come from the same place. Two is pre-selected where the server
 * offers it, because comparing two estimates is the thing most people want and
 * choosing costs nothing — but the tier list decides what exists, not this file.
 */

export interface VisitPlanChooserProps {
  tiers: readonly PlanTierView[];
  /** The chosen size, or null. */
  value: number | null;
  onChange: (planSize: number) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

/** The one-line reason to pick a size. Absent for sizes nobody has a reason for. */
const TIER_NOTE: Record<number, string> = {
  2: "Most people compare two",
  3: "Widest spread of prices",
};

export function VisitPlanChooser({
  tiers,
  value,
  onChange,
  isLoading = false,
  disabled = false,
}: VisitPlanChooserProps) {
  const labelId = useId();

  return (
    <section
      data-visit-plan-chooser
      aria-labelledby={labelId}
      className="rounded-card border border-info-line bg-info-surface px-3.5 py-4"
    >
      <h2 id={labelId} className="text-base font-extrabold text-text">
        How many estimates do you want?
      </h2>
      <p className="mt-1 text-sm leading-5 text-navy-800">
        Each professional measures the site and prices it in writing.
      </p>

      <div className="mt-3">
        {isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <span className="sr-only">Loading the visit plans</span>
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-[58px] w-full rounded-card" />
            ))}
          </div>
        ) : tiers.length === 0 ? (
          // Fail-closed and say so. Nothing can be sold here, and inventing a
          // tier would be quoting a price nobody set.
          <EmptyState
            compact
            title="We cannot offer site visits here yet"
            description="Your request still sends, and it costs nothing. We will be in touch about visits."
          />
        ) : (
          <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby={labelId}>
            {tiers.map((tier) => {
              const checked = value === tier.planSize;
              return (
                <label
                  key={tier.planSize}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-card bg-surface",
                    "transition-colors duration-fast",
                    "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
                    "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                    "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
                    // The selected row's border thickens by a pixel and its
                    // padding loses one, so the card does not grow and shift
                    // everything under it when the choice changes.
                    checked
                      ? "border-2 border-action-secondary px-[13px] py-[11px]"
                      : "border border-navy-100 px-3.5 py-3",
                  )}
                >
                  <input
                    type="radio"
                    name="visit-plan"
                    value={tier.planSize}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onChange(tier.planSize)}
                    className="sr-only"
                  />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-sm text-text",
                        checked ? "font-bold" : "font-semibold",
                      )}
                    >
                      {tier.planSize === 1
                        ? "1 professional"
                        : `${tier.planSize} professionals`}
                    </span>
                    {TIER_NOTE[tier.planSize] !== undefined ? (
                      <span className="mt-0.5 block text-xs text-text-muted">
                        {TIER_NOTE[tier.planSize]}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums text-text",
                      checked ? "text-base font-extrabold" : "text-sm font-bold",
                    )}
                  >
                    {tier.priceLabel}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The tier to start on, when the server offers one worth starting on.
 *
 * Two, where it exists — comparing two estimates is what most people want and
 * choosing charges nothing. Otherwise the smallest published size, and `null`
 * where nothing is published, because a default has to be an option the server
 * actually sells.
 */
export function defaultPlanSize(tiers: readonly PlanTierView[]): number | null {
  if (tiers.length === 0) return null;
  const preferred = tiers.find((tier) => tier.planSize === 2);
  if (preferred !== undefined) return preferred.planSize;
  return Math.min(...tiers.map((tier) => tier.planSize));
}
