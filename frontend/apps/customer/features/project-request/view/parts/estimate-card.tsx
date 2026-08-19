"use client";

import { Button, cn } from "@vsolve/ui";

import { firstStageOf, type QuoteCardView } from "@/features/quotes/adapters";

/**
 * One written estimate, in the shape every other estimate has.
 *
 * ## Structural identity is the whole design
 *
 * Both cards carry the same rows in the same order, so the only thing that
 * varies between them is the numbers. That is what makes two estimates
 * comparable on a phone, where they cannot sit side by side and the customer is
 * comparing the second against a memory of the first.
 *
 * It is also why there is **no "recommended" badge and no reordering by price**.
 * Both were priced after a site visit by a verified professional; ranking them
 * would be this platform expressing a preference between two vendors it has no
 * basis to prefer between, on a screen whose entire job is to let the customer
 * form their own.
 *
 * ## Scope lives one tap deeper
 *
 * Inclusions, exclusions, warranty and the stage-by-stage text are behind "Read
 * it". A card that reproduced the estimate would stop being scannable, which is
 * the only reason to have a card.
 */

export interface EstimateCardProps {
  card: QuoteCardView;
  /** True when every estimate on this request shares one tax basis. */
  isComparableOnOneBasis: boolean;
  /** How long the work runs, when the vendor dated their stages. */
  timeline: string | null;
  onRead: () => void;
  onChoose?: () => void;
  isChoosing?: boolean;
}

export function EstimateCard({
  card,
  isComparableOnOneBasis,
  timeline,
  onRead,
  onChoose,
  isChoosing = false,
}: EstimateCardProps) {
  const firstStage = firstStageOf(card);

  return (
    <article
      id={`estimate-${card.proposalId}`}
      className="scroll-mt-4 overflow-hidden rounded-[14px] border border-line bg-surface"
    >
      <header className="flex items-start justify-between gap-3 p-3.5">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-text">
            {card.vendorName ?? "A professional"}
          </h3>
          {card.visitCompletedAt !== null ? (
            <p className="mt-0.5 text-[12.5px] text-text-muted">
              Visited {card.visitCompletedAt}
            </p>
          ) : null}
        </div>
        {card.isVerified ? (
          <span className="shrink-0 rounded-full bg-success-surface px-2 py-0.5 text-[11px] font-bold text-success-text">
            Verified
          </span>
        ) : null}
      </header>

      <div className="px-3.5 pb-3.5">
        <p className="text-[30px] font-extrabold leading-[34px] tracking-[-0.02em] tabular-nums text-text">
          {card.payableLabel}
        </p>
        {/* Tax basis, stage count and duration, always in this order — the three
            things that make two totals mean the same thing. Each is omitted
            rather than guessed when the vendor did not publish it. */}
        <p className="mt-1 text-[12.5px] leading-5 text-text-muted">
          {[
            isComparableOnOneBasis
              ? card.taxBasis === "INCLUSIVE"
                ? "incl. GST"
                : "plus GST"
              : `tax stated as ${card.taxBasis === "INCLUSIVE" ? "included" : "extra"}`,
            card.stages.length === 0
              ? null
              : `${card.stages.length} ${card.stages.length === 1 ? "stage" : "stages"}`,
            timeline,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {firstStage !== null ? (
        <div className="flex items-baseline justify-between gap-3 border-t border-line bg-warm-50 px-3.5 py-3">
          <span className="text-[13px] text-text-secondary">First stage to fund</span>
          <span className="shrink-0 text-sm font-bold tabular-nums text-text">
            {firstStage.amountLabel}
          </span>
        </div>
      ) : null}

      <div className={cn("flex items-center gap-[9px] border-t border-line p-3.5")}>
        <Button variant="outline" onClick={onRead} className="h-11 shrink-0">
          Read it
          <span className="sr-only">{` — ${card.vendorName ?? "this estimate"}`}</span>
        </Button>
        {onChoose !== undefined ? (
          <Button
            variant="secondary"
            onClick={onChoose}
            // The server decides whether an estimate can still be chosen —
            // expired, withdrawn, superseded — and the card carries its answer.
            // Offering a control the command would refuse is how somebody meets
            // a 409 after making a decision.
            disabled={!card.isSelectable || isChoosing}
            className="h-11 flex-1"
          >
            Choose this
            <span className="sr-only">{` — ${card.vendorName ?? "this estimate"}`}</span>
          </Button>
        ) : null}
      </div>
    </article>
  );
}

/**
 * The placeholder for an estimate that has not arrived.
 *
 * Without it, a customer holding one estimate on a two-visit plan has no way to
 * tell whether the second is coming or whether this is all they get — and the
 * cost of guessing wrong is choosing early. Dashed, quiet, and it names the
 * visit it is waiting on.
 */
export function AwaitingEstimateCard({ visitedOn }: { visitedOn: string | null }) {
  return (
    <div className="rounded-[14px] border border-dashed border-warm-400 p-3.5">
      <p className="text-sm font-semibold text-text-secondary">
        Waiting on the second estimate
      </p>
      <p className="mt-0.5 text-[12.5px] leading-5 text-text-muted">
        {visitedOn === null
          ? "The second professional has not sent theirs yet."
          : `Visited ${visitedOn}. Their written estimate is still to come.`}
      </p>
    </div>
  );
}
