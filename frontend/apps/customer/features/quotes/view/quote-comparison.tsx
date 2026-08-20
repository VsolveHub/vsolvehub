"use client";

import { Badge, cn } from "@vsolve/ui";
import type { ReactNode } from "react";

import { cheapestIndex, type QuoteCardView } from "../adapters";

export interface QuoteComparisonProps {
  cards: readonly QuoteCardView[];
  isComparableOnOneBasis: boolean;
  detailHrefFor?: (proposalId: string) => string;
  onChoose?: (proposalId: string) => void;
  isChoosing?: boolean;
  pickedId?: string | null;
  onPick?: (proposalId: string) => void;
}

export function QuoteComparison(props: QuoteComparisonProps) {
  const { cards, pickedId = null, onPick } = props;
  if (cards.length === 0) return null;

  const cheapest = cheapestIndex(cards);
  const rows = comparisonRows(cards, cheapest);

  return (
    <section aria-labelledby="comparison-heading">
      <h2 id="comparison-heading" className="sr-only">
        Quotes compared side by side
      </h2>
      <div className="overflow-x-auto rounded-[10px] border border-line bg-surface shadow-card">
        <table className="w-full min-w-[1040px] border-collapse text-left">
          <caption className="sr-only">
            Quotes compared field by field, with one column per professional.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-[200px] border-b border-line bg-surface p-0" />
              {cards.map((card, index) => {
                const picked = card.proposalId === pickedId;
                const pickable = onPick !== undefined && card.isSelectable && !card.isExpired;
                return (
                  <th
                    key={card.proposalId}
                    scope="col"
                    className={cn(
                      "w-[326px] border-b border-line px-4 py-5 align-top text-text",
                      picked
                        ? "bg-selected-surface shadow-[inset_0_3px_0_0_var(--color-selected)]"
                        : null,
                    )}
                  >
                    <div className="flex min-h-[110px] flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-extrabold leading-tight tracking-tight">
                            {card.vendorName ?? `Quote ${index + 1}`}
                          </p>
                          <p className="mt-1 text-sm font-medium leading-tight text-text-secondary">
                            {vendorLine(card)}
                          </p>
                        </div>
                        {card.isVerified ? (
                          <Badge tone="success" className="px-2 py-0.5 text-[0.6875rem]">
                            Verified
                          </Badge>
                        ) : null}
                      </div>

                      {pickable ? (
                        <button
                          type="button"
                          aria-pressed={picked}
                          onClick={() => onPick(card.proposalId)}
                          className={cn(
                            "mt-auto flex min-h-[42px] w-full items-center justify-center gap-2 rounded-[6px] px-3 text-sm font-extrabold leading-tight",
                            "transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                            picked
                              ? "bg-action-secondary text-action-secondary-text"
                              : "bg-surface text-text ring-1 ring-inset ring-line-strong hover:bg-surface-hover",
                          )}
                        >
                          {picked ? <CheckIcon className="size-3.5" /> : null}
                          {picked ? "Selected" : "Select this quote"}
                          <span className="sr-only">
                            {` - ${card.vendorName ?? `quote ${index + 1}`}`}
                          </span>
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
                <th
                  scope="row"
                  className="w-[200px] border-b border-line bg-surface-sunken px-4 py-4 align-top text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-text-muted"
                >
                  {row.label}
                </th>
                {row.values.map((value, index) => {
                  const picked = cards[index]?.proposalId === pickedId;
                  return (
                    <td
                      key={`${row.label}-${cards[index]?.proposalId ?? index}`}
                      className={cn(
                        "border-b border-line px-4 py-4 align-top text-[0.9375rem] font-semibold leading-6 text-text",
                        picked ? "bg-selected-surface" : null,
                        row.emphasis ? "text-2xl font-extrabold tracking-tight" : null,
                      )}
                    >
                      {value ?? <span className="text-text-muted">Not stated</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface MatrixRow {
  label: string;
  values: readonly ReactNode[];
  emphasis?: boolean;
}

function comparisonRows(
  cards: readonly QuoteCardView[],
  cheapest: number | null,
): readonly MatrixRow[] {
  return [
    {
      label: "Price",
      values: cards.map((card) => card.payableLabel),
      emphasis: true,
    },
    {
      label: "Tax",
      values: cards.map((card) => (card.taxBasis === "INCLUSIVE" ? "Included" : "On top")),
    },
    {
      label: "How long",
      values: cards.map((card) =>
        card.minimumDays === null
          ? null
          : card.minimumDays === 1
            ? "1 day"
            : `${card.minimumDays} days`,
      ),
    },
    {
      label: "Warranty",
      values: cards.map((card) => card.warrantyTerms),
    },
    {
      label: "Worth noting",
      values: cards.map((card, index) => {
        if (cheapest === index) return `Lowest of the ${countWord(cards.length)}`;
        if (card.isOutOfBudget) return "Above your budget";
        if (card.isExpired) return "Price expired";
        return null;
      }),
    },
    {
      label: "What is included",
      values: cards.map((card) => <ScopeLines key={card.proposalId} card={card} />),
    },
  ].filter((row) => row.values.some((value) => value !== null));
}

function ScopeLines({ card }: { card: QuoteCardView }) {
  const lines = [
    ...card.inclusions.map((line) => ({ line, included: true })),
    ...card.exclusions.map((line) => ({ line, included: false })),
  ];

  if (lines.length === 0) return <span className="text-text-muted">Not stated</span>;

  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {lines.map((entry, index) => (
        <li
          key={`${card.proposalId}-${index}`}
          className="flex items-start gap-2 text-sm font-medium leading-5 text-text-secondary"
        >
          {entry.included ? (
            <CheckIcon className="mt-1 size-3.5 shrink-0 text-success-text" />
          ) : (
            <CrossIcon className="mt-1 size-3.5 shrink-0 text-warm-400" />
          )}
          <span>{entry.line}</span>
        </li>
      ))}
    </ul>
  );
}

function vendorLine(card: QuoteCardView): string {
  const quotedAt = formatSubmittedAt(card.submittedAt);
  return [card.vendorType, quotedAt === null ? null : `quoted ${quotedAt}`]
    .filter(Boolean)
    .join(" · ");
}

function formatSubmittedAt(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .replace(",", "")
    .toLowerCase();
}

function countWord(count: number): string {
  if (count === 1) return "one";
  if (count === 2) return "two";
  if (count === 3) return "three";
  return String(count);
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

function CrossIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      className={className}
    >
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  );
}
