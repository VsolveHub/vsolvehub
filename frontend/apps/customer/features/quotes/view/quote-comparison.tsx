"use client";

import { Badge, cn } from "@vsolve/ui";
import type { ReactNode } from "react";

import {
  cheapestIndex,
  firstStageOf,
  scopeDifferenceRows,
  type QuoteCardView,
} from "../adapters";
import { timelineLabel, validityLabel } from "./quote-card";
import { VendorTrustLine } from "./vendor-trust-line";

export interface QuoteComparisonProps {
  cards: readonly QuoteCardView[];
  isComparableOnOneBasis: boolean;
  detailHrefFor?: (proposalId: string) => string;
  pickedId?: string | null;
  /** The quote already chosen on the persisted selection. */
  chosenId?: string | null;
  onPick?: (proposalId: string) => void;
}

/**
 * The estimates side by side, and — the part that decides it — where they differ.
 *
 * The rows are the questions a Customer actually asks in order: what do I pay,
 * what do I pay to start, how long, what warranty, how long does the price
 * hold, how is it priced. Then the scope lines the professionals disagree on,
 * one row each, with a tick or a cross per column. Lines everybody includes
 * are not shown; a row of ticks is noise on the table whose whole job is the
 * differences.
 *
 * **It compares and it does not decide.** Picking stays here and on the cards;
 * committing stays on the confirm screen.
 */
export function QuoteComparison(props: QuoteComparisonProps) {
  const { cards, pickedId = null, chosenId = null, onPick, isComparableOnOneBasis } = props;
  if (cards.length === 0) return null;

  const cheapest = isComparableOnOneBasis ? cheapestIndex(cards) : null;
  const rows = comparisonRows(cards, cheapest);
  const differences = scopeDifferenceRows(cards);

  return (
    <section aria-labelledby="comparison-heading">
      <h2 id="comparison-heading" className="sr-only">
        Estimates compared side by side
      </h2>
      <div className="overflow-x-auto rounded-[14px] border border-line bg-surface shadow-card">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <caption className="sr-only">
            Estimates compared field by field, with one column per professional.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-[170px] border-b border-line bg-surface p-0" />
              {cards.map((card, index) => {
                const picked = card.proposalId === pickedId;
                const chosen = card.proposalId === chosenId;
                const pickable = onPick !== undefined && card.isSelectable && !card.isExpired;
                return (
                  <th
                    key={card.proposalId}
                    scope="col"
                    className={cn(
                      "min-w-[220px] border-b border-line px-4 py-4 align-top text-text",
                      picked || chosen ? "bg-selected-surface shadow-[inset_0_3px_0_0_var(--color-selected)]" : null,
                    )}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-base font-extrabold leading-tight tracking-tight">
                          {card.vendorName ?? `Estimate ${index + 1}`}
                        </p>
                        {chosen ? (
                          <Badge tone="success">Chosen</Badge>
                        ) : card.isVerified ? (
                          <Badge tone="success">Verified</Badge>
                        ) : null}
                      </div>
                      <VendorTrustLine trust={card.trust} />
                      {pickable ? (
                        <button
                          type="button"
                          aria-pressed={picked}
                          onClick={() => onPick(card.proposalId)}
                          className={cn(
                            "mt-2 flex min-h-[38px] w-full items-center justify-center rounded-[8px] px-3 text-sm font-extrabold",
                            "transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                            picked
                              ? "bg-action-secondary text-action-secondary-text"
                              : "bg-surface text-text ring-1 ring-inset ring-line-strong hover:bg-surface-hover",
                          )}
                        >
                          {picked ? "Leaning this way" : "Lean this way"}
                          <span className="sr-only">{` - ${card.vendorName ?? `estimate ${index + 1}`}`}</span>
                        </button>
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
                    emphasis={row.emphasis}
                  >
                    {value ?? <span className="font-medium text-text-muted">Not stated</span>}
                  </Cell>
                ))}
              </tr>
            ))}

            {differences.length > 0 ? (
              <>
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={cards.length + 1}
                    className="border-b border-line bg-surface-sunken px-4 py-2.5 text-left text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-text-muted"
                  >
                    Scope — where they differ
                  </th>
                </tr>
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
              </>
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
        "border-b border-line bg-surface-sunken px-4 py-3 align-top",
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
  emphasis = false,
}: {
  children: ReactNode;
  highlighted: boolean;
  emphasis?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-b border-line px-4 py-3 align-top text-[0.9375rem] font-semibold leading-6 text-text",
        highlighted ? "bg-selected-surface" : null,
        emphasis ? "text-2xl font-extrabold tracking-tight" : null,
      )}
    >
      {children}
    </td>
  );
}

interface MatrixRow {
  label: string;
  values: readonly ReactNode[];
  emphasis?: boolean;
}

function comparisonRows(cards: readonly QuoteCardView[], cheapest: number | null): readonly MatrixRow[] {
  const rows: MatrixRow[] = [
    {
      label: "Total",
      emphasis: true,
      values: cards.map((card, index) => (
        <span key={card.proposalId} className="flex flex-col">
          <span>{card.payableLabel}</span>
          {cheapest === index ? (
            <span className="text-xs font-bold uppercase tracking-[0.06em] text-success-text">Lowest</span>
          ) : null}
        </span>
      )),
    },
    {
      label: "To start",
      values: cards.map((card) => {
        const first = firstStageOf(card);
        return first === null ? null : `${first.amountLabel} — ${first.title}`;
      }),
    },
    { label: "Timeline", values: cards.map((card) => timelineLabel(card)) },
    {
      label: "Warranty",
      values: cards.map((card) =>
        card.warrantyTerms === null ? (
          <span key={card.proposalId} className="font-semibold text-warning-text">Not stated ⚠</span>
        ) : (
          card.warrantyTerms
        ),
      ),
    },
    {
      label: "Valid",
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
      label: "Tax",
      values: cards.map((card) => (card.taxBasis === "INCLUSIVE" ? `Included (${card.taxLabel})` : `On top (${card.taxLabel})`)),
    },
  ];
  return rows.filter((row) => row.values.some((value) => value !== null));
}
