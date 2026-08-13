"use client";

import { Badge } from "@vsolve/ui";

import { cheapestIndex, toComparisonRows, type QuoteCardView } from "../adapters";

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
}

export function QuoteComparison({ cards, isComparableOnOneBasis }: QuoteComparisonProps) {
  if (cards.length < 2) return null;

  const rows = toComparisonRows(cards);
  const equivalent = rows.filter((row) => row.equivalent);
  const assumptions = rows.filter((row) => !row.equivalent);
  const cheapest = isComparableOnOneBasis ? cheapestIndex(cards) : null;

  return (
    <section aria-labelledby="comparison-heading" className="mt-6">
      <h2 id="comparison-heading" className="text-lg font-semibold text-text">
        Side by side
      </h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        {isComparableOnOneBasis
          ? "Every professional here quoted tax the same way, so the totals below are the amount you would actually pay."
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
            {equivalent.map((row) => (
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
        </table>
      </div>
    </section>
  );
}
