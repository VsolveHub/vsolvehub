"use client";

import { Badge, Button, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import {
  cheapestIndex,
  savingsAgainstDearest,
  toComparisonRows,
  type QuoteCardView,
} from "../adapters";

/**
 * Side by side, on one tax basis — `M2-FE-408`.
 *
 * Two claims and they are different sizes:
 *
 * 1. **Equivalent fields are normalised and may be ranked.** The load-bearing
 *    one is the total: a GST-registered vendor quoting `EXCLUSIVE` and an
 *    unregistered one quoting `INCLUSIVE` publish two numbers that are not
 *    comparable, and putting them beside each other unnormalised makes the more
 *    expensive quote look cheaper. `comparableTotalPaise` puts both on "what you
 *    actually pay", and the row underneath still shows how each vendor stated
 *    it, because normalising silently would hide the thing being normalised.
 *
 * 2. **Non-equivalent fields are shown and never ranked.** Inclusions,
 *    exclusions, warranty and commission treatment are *assumptions* — what each
 *    vendor decided the job is — and a shorter exclusion list is not a better
 *    offer, it may be a less careful one. They are grouped separately with the
 *    caveat attached, rather than mixed into a table that implies a winner.
 *
 * This is possible for the first time at contract 1.24.0: `required_tax_basis`
 * forces one basis per requirement and `ProposalStage` is a published shape, so
 * two vendors can no longer send two incomparable structures.
 *
 * ## The table is a real table
 *
 * `<table>` with a header row of vendors and a row header per field, so a screen
 * reader announces "Rakesh Electricals, What you pay, ₹42,000" rather than
 * reading eleven unlabelled cells. A grid of cards would have looked the same
 * and said nothing.
 */

export interface QuoteComparisonProps {
  cards: readonly QuoteCardView[];
  /**
   * False when the delivered quotes do not share a tax basis.
   *
   * The server forces one basis per requirement, so this is the defensive case —
   * and if it ever happens the view says so instead of presenting numbers that
   * are not comparable as though they were.
   */
  isComparableOnOneBasis: boolean;
  /**
   * Where the full estimate is read. One href per card, by proposal id.
   *
   * The table compares; it does not reproduce an estimate. Scope detail, stage
   * text and the vendor's own wording stay behind this link, because a table
   * that tried to hold them would stop being scannable — which is the only
   * reason to build a table.
   */
  detailHrefFor?: (proposalId: string) => string;
  /** Choosing from the table. Omit and the column footers render no action. */
  onChoose?: (proposalId: string) => void;
  isChoosing?: boolean;
}

export function QuoteComparison({
  cards,
  isComparableOnOneBasis,
  detailHrefFor,
  onChoose,
  isChoosing = false,
}: QuoteComparisonProps) {
  // One estimate is still worth a table: the rows are the questions somebody
  // should ask about *any* estimate, and answering them in a fixed order is
  // useful even with nothing to compare against. Zero is not — an empty table is
  // a header row and a promise.
  if (cards.length === 0) return null;

  const rows = toComparisonRows(cards);
  const equivalent = rows.filter((row) => row.equivalent);
  const assumptions = rows.filter((row) => !row.equivalent);
  const cheapest = isComparableOnOneBasis ? cheapestIndex(cards) : null;
  const savings = savingsAgainstDearest(cards, isComparableOnOneBasis);

  return (
    <section aria-labelledby="comparison-heading" className="mt-6">
      <h2 id="comparison-heading" className="text-lg font-semibold text-text">
        {cards.length === 1 ? "The estimate" : "Side by side"}
      </h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        {cards.length === 1
          ? "Priced after seeing the site. Nothing is charged until you choose it."
          : isComparableOnOneBasis
            ? "Every professional here quoted tax the same way, so the totals below are the amount you would actually pay. Nothing is charged until you choose one."
            : "These quotes state tax differently, so we are not ranking them. Read the totals with that in mind."}
      </p>

      {/* Wide content scrolls inside its own container rather than making the
          page scroll sideways — three vendors and eleven rows does not fit a
          phone, and a horizontally scrolling page loses the row headers. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <caption className="sr-only">
            Quotes compared field by field. Equivalent fields first, then each
            professional&apos;s own assumptions.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-line p-3 text-sm text-text-secondary">
                Field
              </th>
              {cards.map((card, index) => (
                <th
                  key={card.proposalId}
                  scope="col"
                  className="border-b border-line p-3 align-bottom text-text"
                >
                  <span className="block font-semibold">
                    {card.vendorName ?? `Quote ${index + 1}`}
                  </span>
                  {cheapest === index ? (
                    <span className="mt-1 inline-block">
                      <Badge tone="success">Lowest total</Badge>
                    </span>
                  ) : null}
                  {card.isOutOfBudget ? (
                    <span className="mt-1 inline-block">
                      <Badge tone="warning">Over budget</Badge>
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {equivalent.map((row, rowIndex) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="border-b border-line p-3 align-top text-sm font-medium text-text-secondary"
                >
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td
                    key={`${row.label}-${cards[index]?.proposalId ?? index}`}
                    className="border-b border-line p-3 align-top text-text"
                  >
                    {value ?? <span className="text-text-secondary">Not stated</span>}
                    {/* The delta rides on the totals row only, under the figure
                        it is about. It does the subtraction nobody wants to do
                        against two six-digit amounts. */}
                    {rowIndex === 0 && savings[index] != null ? (
                      <span className="mt-0.5 block text-sm font-semibold text-success-text">
                        {savings[index]} lower
                      </span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>

          {assumptions.length > 0 ? (
            <tbody>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={cards.length + 1}
                  className="border-b border-line bg-surface-sunken p-3 text-left text-sm font-semibold text-text"
                >
                  What each of them assumed — not comparable, and worth reading
                </th>
              </tr>
              {assumptions.map((row) => (
                <tr key={row.label}>
                  <th
                    scope="row"
                    className="border-b border-line p-3 align-top text-sm font-medium text-text-secondary"
                  >
                    {row.label}
                    {row.caveat !== undefined ? (
                      <span className="mt-1 block text-xs font-normal leading-5 text-text-secondary">
                        {row.caveat}
                      </span>
                    ) : null}
                  </th>
                  {row.values.map((value, index) => (
                    <td
                      key={`${row.label}-${cards[index]?.proposalId ?? index}`}
                      className="border-b border-line p-3 align-top text-text"
                    >
                      {value ?? <span className="text-text-secondary">Not stated</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : null}

          {/* The actions, as the table's own footer rather than a row of buttons
              floating under it — so each control stays in the column it belongs
              to, and a screen reader still hears the vendor's name as the
              column header when it reaches one. */}
          {detailHrefFor !== undefined || onChoose !== undefined ? (
            <tfoot>
              <tr>
                <th scope="row" className="p-3 text-left">
                  <span className="sr-only">Actions</span>
                </th>
                {cards.map((card) => (
                  <td key={`actions-${card.proposalId}`} className="p-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      {detailHrefFor !== undefined ? (
                        <Link
                          href={detailHrefFor(card.proposalId)}
                          className={buttonStyles({ variant: "outline", size: "sm" })}
                        >
                          Read it
                          <span className="sr-only">
                            {` — ${card.vendorName ?? "this estimate"}`}
                          </span>
                        </Link>
                      ) : null}
                      {onChoose !== undefined ? (
                        <Button
                          size="sm"
                          // The server decides whether an estimate can still be
                          // chosen — expired, withdrawn, already superseded — and
                          // the card carries its answer. Offering a control the
                          // command would refuse is how a Customer meets a 409
                          // after making a decision.
                          disabled={!card.isSelectable || isChoosing}
                          onClick={() => onChoose(card.proposalId)}
                        >
                          Choose
                          <span className="sr-only">
                            {` ${card.vendorName ?? "this estimate"}`}
                          </span>
                        </Button>
                      ) : null}
                    </div>
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Prices are the professionals&rsquo; own. We do not mark them up, and
        nothing is charged until you choose one.
      </p>
    </section>
  );
}
