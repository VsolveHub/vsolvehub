"use client";

import { Badge, cn } from "@vsolve/ui";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import {
  cheapestIndex,
  firstStageOf,
  materialCountLabel,
  scopeDifferenceRows,
  sharedScopeLines,
  superlativeFor,
  type QuoteCardView,
} from "../adapters";
import { timelineLabel, validityLabel } from "./quote-card";
import { VendorTrustLine } from "./vendor-trust-line";

export interface QuoteComparisonProps {
  cards: readonly QuoteCardView[];
  isComparableOnOneBasis: boolean;
  detailHrefFor?: (proposalId: string) => string;
  /** Where `Choose` goes from a column header. Withheld and the button is not rendered. */
  confirmHrefFor?: (proposalId: string) => string;
  pickedId?: string | null;
  /** The quote already chosen on the persisted selection. */
  chosenId?: string | null;
  onPick?: (proposalId: string) => void;
  canChoose?: boolean;
}

/**
 * The estimates as columns of one table — and, on a wide screen, the whole page.
 *
 * ## Why this is the desktop layout rather than a section of it
 *
 * A desktop screen can hold three estimates in the eye at once, which is the
 * one thing a phone can never do, and it is exactly what the hard question
 * needs: *why is this one ₹63,000 cheaper?* The old wide layout answered it
 * twice and badly — a grid of cards, and then this table underneath repeating
 * the same estimates in a second format. Now the cards *are* these columns
 * below `lg`, and this is what they become above it.
 *
 * ## Sticky in two directions
 *
 * The vendor band pins to the top so scrolling forty rows of differences never
 * costs you which column is whose — and it carries `Choose`, which is why a
 * wide screen needs no docked action bar at all. The row-label gutter pins to
 * the left so a fourth and fifth estimate can scroll sideways without
 * orphaning their labels. The horizontal scroll lives inside this component;
 * the page body never scrolls sideways.
 *
 * ## Differences first, everything else on request
 *
 * Scope lines every professional included are hidden behind `Show all`. A row
 * of ticks is noise on the one table whose entire job is where they disagree.
 *
 * **It compares and it does not decide.** Picking sets no server state;
 * committing still happens on the confirm screen.
 */
export function QuoteComparison(props: QuoteComparisonProps) {
  const {
    cards,
    pickedId = null,
    chosenId = null,
    onPick,
    isComparableOnOneBasis,
    detailHrefFor,
    confirmHrefFor,
    canChoose = false,
  } = props;
  const [showAll, setShowAll] = useState(false);

  if (cards.length === 0) return null;

  const cheapest = isComparableOnOneBasis ? cheapestIndex(cards) : null;
  const rows = comparisonRows(cards);
  const differences = scopeDifferenceRows(cards);
  const shared = sharedScopeLines(cards);

  return (
    <section aria-labelledby="comparison-heading">
      <h2 id="comparison-heading" className="sr-only">
        Estimates compared side by side
      </h2>
      <div className="overflow-x-auto rounded-[14px] border border-line bg-surface shadow-card">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <caption className="sr-only">
            Estimates compared field by field, with one column per professional. Rows every
            professional agrees on are hidden until Show all is pressed.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 w-[132px] border-b border-line bg-surface p-0"
              />
              {cards.map((card, index) => {
                const picked = card.proposalId === pickedId;
                const chosen = card.proposalId === chosenId;
                const pickable = onPick !== undefined && card.isSelectable && !card.isExpired;
                const superlative = superlativeFor(card, cards);
                return (
                  <th
                    key={card.proposalId}
                    scope="col"
                    className={cn(
                      "sticky top-0 z-10 min-w-[210px] border-b border-line px-4 py-4 align-top text-text",
                      picked || chosen
                        ? "bg-selected-surface shadow-[inset_0_3px_0_0_var(--color-selected)]"
                        : "bg-surface",
                    )}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          disabled={!pickable}
                          aria-pressed={picked}
                          onClick={() => onPick?.(card.proposalId)}
                          className={cn(
                            "min-w-0 text-left text-base font-extrabold leading-tight tracking-tight",
                            pickable ? "cursor-pointer hover:text-action" : "cursor-default",
                            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                          )}
                        >
                          {card.vendorName ?? `Estimate ${index + 1}`}
                        </button>
                        {chosen ? (
                          <Badge tone="success">Chosen</Badge>
                        ) : card.isVerified ? (
                          <Badge tone="success">Verified</Badge>
                        ) : null}
                      </div>
                      <VendorTrustLine trust={card.trust} />

                      <p className="mt-2 text-[22px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-text">
                        {card.payableLabel}
                      </p>
                      {superlative !== null ? (
                        <p className="mt-1 inline-flex w-fit rounded-full bg-success-surface px-2 py-0.5 text-[11px] font-extrabold text-success-text">
                          {superlative.label}
                        </p>
                      ) : card.isOutOfBudget ? (
                        <p className="mt-1 inline-flex w-fit rounded-full bg-warning-surface px-2 py-0.5 text-[11px] font-extrabold text-warning-text">
                          Over your budget
                        </p>
                      ) : null}

                      {canChoose && pickable && confirmHrefFor !== undefined ? (
                        <Link
                          href={confirmHrefFor(card.proposalId)}
                          className="mt-2.5 flex min-h-[38px] items-center justify-center rounded-[8px] bg-action px-3 text-sm font-extrabold text-action-text transition-colors duration-fast hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                          Choose
                          <span aria-hidden className="ml-1.5 text-base leading-none">›</span>
                          <span className="sr-only">{` ${card.vendorName ?? `estimate ${index + 1}`}`}</span>
                        </Link>
                      ) : null}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <RowHead>{row.label}</RowHead>
                {row.values.map((value, index) => (
                  <Cell
                    key={`${row.label}-${cards[index]?.proposalId ?? index}`}
                    highlighted={cards[index]?.proposalId === pickedId || cards[index]?.proposalId === chosenId}
                    winner={row.label === "Total" && cheapest === index}
                  >
                    {value ?? <span className="font-medium text-text-muted">Not stated</span>}
                  </Cell>
                ))}
              </tr>
            ))}

            {differences.length > 0 || shared.length > 0 ? (
              <tr>
                <th
                  scope="rowgroup"
                  colSpan={cards.length + 1}
                  className="border-b border-line bg-surface-sunken px-4 py-2.5 text-left"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-text-muted">
                      {differences.length > 0 ? "Where they differ" : "Scope"}
                    </span>
                    {shared.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowAll((current) => !current)}
                        className="text-xs font-bold text-text-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                      >
                        {showAll
                          ? "Show differences only"
                          : `Show all · ${shared.length} more all of them include`}
                      </button>
                    ) : null}
                  </span>
                </th>
              </tr>
            ) : null}

            {differences.map((row) => (
              <tr key={row.line}>
                <RowHead plain>{row.line}</RowHead>
                {row.included.map((included, index) => (
                  <Cell
                    key={`${row.line}-${cards[index]?.proposalId ?? index}`}
                    highlighted={cards[index]?.proposalId === pickedId || cards[index]?.proposalId === chosenId}
                  >
                    <span className={cn("font-bold", included ? "text-success-text" : "text-warm-500")}>
                      {included ? "✓ Included" : "✗ Not included"}
                    </span>
                  </Cell>
                ))}
              </tr>
            ))}

            {showAll
              ? shared.map((line) => (
                  <tr key={`shared-${line}`}>
                    <RowHead plain>{line}</RowHead>
                    {cards.map((card) => (
                      <Cell
                        key={`shared-${line}-${card.proposalId}`}
                        highlighted={card.proposalId === pickedId || card.proposalId === chosenId}
                      >
                        <span className="font-bold text-success-text">✓ Included</span>
                      </Cell>
                    ))}
                  </tr>
                ))
              : null}

            {detailHrefFor !== undefined ? (
              <tr>
                <RowHead plain>{""}</RowHead>
                {cards.map((card) => (
                  <Cell
                    key={`read-${card.proposalId}`}
                    highlighted={card.proposalId === pickedId || card.proposalId === chosenId}
                  >
                    <Link
                      href={detailHrefFor(card.proposalId)}
                      className="text-sm font-bold text-text-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      Read in full ›
                    </Link>
                  </Cell>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {!isComparableOnOneBasis ? (
        <p className="mt-2 text-sm text-text-secondary">
          These estimates state tax differently, so the totals are not ranked against each other.
        </p>
      ) : null}
      <p className="mt-2 text-xs leading-5 text-text-muted">
        A shorter list is not a worse offer — it may be a more careful one. What is not written
        down is what you would pay for separately.
      </p>
    </section>
  );
}

function RowHead({ children, plain = false }: { children: ReactNode; plain?: boolean }) {
  return (
    <th
      scope="row"
      className={cn(
        // Pinned so a fourth and fifth estimate scroll sideways without
        // orphaning the label that says what the row is.
        "sticky left-0 z-10 border-b border-line bg-surface-sunken px-4 py-3 align-top",
        plain
          ? "text-sm font-semibold text-text"
          : "text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-text-muted",
      )}
    >
      {children}
    </th>
  );
}

function Cell({
  children,
  highlighted,
  winner = false,
}: {
  children: ReactNode;
  highlighted: boolean;
  winner?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-b border-line px-4 py-3 align-top text-[0.9375rem] font-semibold leading-6 tabular-nums text-text",
        highlighted ? "bg-selected-surface" : null,
        winner ? "text-success-text" : null,
      )}
    >
      {children}
    </td>
  );
}

interface MatrixRow {
  label: string;
  values: readonly ReactNode[];
}

/**
 * The Four Facts first, in the same order and the same words the cards use,
 * then the rest. A Customer who scrolled the cards on a phone and opens the
 * same request on a laptop should not have to relearn the vocabulary.
 */
function comparisonRows(cards: readonly QuoteCardView[]): readonly MatrixRow[] {
  const rows: MatrixRow[] = [
    {
      label: "Total",
      values: cards.map((card) => card.payableLabel),
    },
    {
      label: "To start",
      values: cards.map((card) => firstStageOf(card)?.amountLabel ?? null),
    },
    { label: "Takes", values: cards.map((card) => timelineLabel(card)) },
    {
      label: "Holds for",
      values: cards.map((card) => {
        const validity = validityLabel(card);
        return validity === null ? null : (
          <span key={card.proposalId} className={validity.urgent ? "text-warning-text" : undefined}>
            {validity.text}
          </span>
        );
      }),
    },
    {
      label: "Warranty",
      values: cards.map((card) =>
        card.warrantyTerms === null ? (
          <span key={card.proposalId} className="font-semibold text-warning-text">Not stated</span>
        ) : (
          card.warrantyTerms
        ),
      ),
    },
    {
      label: "Priced",
      values: cards.map((card) =>
        card.itemLines.length > 0
          ? `Item-wise (${card.itemLines.length})`
          : card.labourLines.length > 0
            ? `Labour-wise (${card.labourLines.length})`
            : card.rateLabel !== null
              ? `${card.rateLabel} per worker per day`
              : null,
      ),
    },
    {
      // A count only. The list is priceless by contract, and what the
      // Customer buys is outside every total in the row above it.
      label: "Materials",
      values: cards.map((card) =>
        card.materialFulfilmentMode === "PARTNER_TURNKEY"
          ? `Included · ${materialCountLabel(card.includedSupplyList.length)}`
          : `You buy · ${materialCountLabel(card.materialList.length)}`,
      ),
    },
    {
      label: "Tax",
      values: cards.map((card) => (card.taxBasis === "INCLUSIVE" ? `Included (${card.taxLabel})` : `On top (${card.taxLabel})`)),
    },
  ];
  return rows.filter((row) => row.values.some((value) => value !== null));
}
