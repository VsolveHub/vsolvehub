"use client";

import { Button, Skeleton } from "@vsolve/ui";
import type { ReactNode } from "react";

import type { PlanTierView } from "../adapters";
import { AccessRefusal } from "./access-refusal";

/**
 * The A5 visit-plan chooser — `M2-FE-216`.
 *
 * **A control on the review screen. Never a fifth screen.** The requirement flow
 * is budgeted at four screens and `features/requirement/boundary.test.ts`
 * asserts `SCREENS.length === 4`, so this renders inside review beside the
 * optional extras — a decision the Customer makes while looking at what they are
 * about to send, not a step they walk through.
 *
 * It also never renders for A3. A3 sells remote quotes through the unlock; there
 * are no visits to plan, and `POST .../visit-plan/` answers `400
 * m2_lifecycle_not_supported` to prove it. The caller decides from the server's
 * inferred lifecycle and simply does not mount this.
 *
 * ## Choosing charges nothing, and the screen says so in those words
 *
 * It bounds the invitation wave and snapshots the price the Customer was shown,
 * so a price loaded between choosing and the first vendor confirming cannot
 * silently become what they pay. The money is taken later, once — when the first
 * professional confirms a time.
 *
 * ## An empty tier list is the honest answer, not a loading state
 *
 * `available_tiers: []` means the owner has priced no tier and **nothing can be
 * sold**. The panel says we cannot offer visits here yet. It does not render
 * 49/99/199: those are proposed figures in a planning document, and a screen
 * that prints them would be quoting a price nobody approved.
 */

export interface VisitPlanChooserProps {
  tiers: readonly PlanTierView[];
  /** The size already chosen, or null. Re-choosing is allowed until a vendor commits. */
  chosenPlanSize: number | null;
  /**
   * True once a professional has committed to a slot.
   *
   * `POST .../visit-plan/` then answers `409
   * m2_requirement_transition_not_allowed`, because resizing a plan somebody is
   * already travelling for is not a choice. The control disappears rather than
   * refusing on press.
   */
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
    <section className="mt-6 rounded-card border border-line bg-surface p-4" aria-labelledby="plan-heading">
      <h3 id="plan-heading" className="text-sm font-semibold text-text">
        How many professionals should visit?
      </h3>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        For work like this, nobody can price it properly without seeing it. Pick
        how many verified professionals come and give you a written estimate on
        site. <strong className="font-semibold text-text">Choosing costs nothing now</strong> —
        you pay once, when the first one confirms a time.
      </p>

      {isLoading ? (
        <div className="mt-3" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading visit options</span>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : readError !== null && readError !== undefined ? (
        <div className="mt-3">
          <AccessRefusal
            error={readError}
            attempting="choose how many professionals visit"
            supportAction={supportAction}
            onRetry={onRetryRead}
          />
        </div>
      ) : tiers.length === 0 ? (
        <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
          We cannot offer site visits for this yet. We have not set a price for
          them, so there is nothing to choose here and nothing to pay. Talk to us
          and we will tell you where this stands.
        </p>
      ) : locked ? (
        <p className="mt-3 max-w-prose text-sm leading-6 text-text">
          A professional has already committed to a time, so the number of visits
          is fixed at {chosenPlanSize ?? tiers[0]?.planSize}. Changing it now
          would cancel a journey somebody has already planned.
        </p>
      ) : (
        <ul className="mt-3 flex list-none flex-col gap-2 p-0">
          {tiers.map((tier) => {
            const isChosen = chosenPlanSize === tier.planSize;
            return (
              <li
                key={tier.planSize}
                className={`flex items-center justify-between gap-4 rounded-card border p-3 ${
                  isChosen ? "border-action-line bg-action-surface" : "border-line"
                }`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-text">{tier.headline}</p>
                  <p className="mt-0.5 text-sm text-text-secondary">
                    {tier.priceLabel} for the whole plan
                    {tier.planSize > 1
                      ? ` — every visit that does not happen refunds its share of that.`
                      : ` — refunded in full if the visit never happens.`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={isChosen ? "outline" : "primary"}
                  onClick={() => onChoose(tier.planSize)}
                  loading={isChoosing}
                  loadingLabel="Saving your choice"
                  aria-pressed={isChosen}
                >
                  {isChosen ? "Chosen" : "Choose"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {chosenPlanSize !== null && !locked && tiers.length > 0 ? (
        <p className="mt-3 text-sm text-text-secondary" role="status">
          You can change this until the first professional confirms a time.
        </p>
      ) : null}

      <div className="mt-3">
        <AccessRefusal
          error={chooseError}
          attempting="choose how many professionals visit"
          supportAction={supportAction}
        />
      </div>
    </section>
  );
}
