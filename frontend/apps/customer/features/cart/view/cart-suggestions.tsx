"use client";

import { formatMoney } from "@vsolve/ui";
import Link from "next/link";

import type { ServiceCard } from "../queries";

/**
 * Services one professional could add to a visit this cart already has.
 *
 * The heading is a claim, and the server is what makes it true: every card here
 * carries an active `SAME_PARTNER_SEQUENTIAL` compatibility rule against
 * something already in the cart — the same rule the planner uses to merge work
 * into one unit. Adding one of these therefore does not add a visit, which is
 * why it does not re-apply the per-visit minimum. That is a real saving, and the
 * reason this section earns its space.
 *
 * ## Why these are links, not "Add" buttons
 *
 * A `ServiceCard` names a service, not a variant, and a variant needs its scope
 * answered — how many switches, which room — before it can be priced. A one-tap
 * Add would have to pick a variant and invent a scope on the customer's behalf,
 * then show them a price for something they never described. The card opens the
 * service instead, where those questions get asked.
 *
 * Renders `null` when the list is empty. There is deliberately no fallback row:
 * a cart with nothing compatible has nothing to say here, and filling the gap
 * with popular services would turn the heading into a promise that breaks when a
 * second professional turns up.
 */
export interface CartSuggestionsProps {
  suggestions: readonly ServiceCard[];
}

export function CartSuggestions({ suggestions }: CartSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <section aria-labelledby="cart-suggestions-heading" className="mt-10">
      <h2 id="cart-suggestions-heading" className="text-base font-bold text-text">
        Add to the same visit
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        The same professional can do these while they are with you, so there is no second
        visit fee.
      </p>

      {/* Scrolls inside itself. A horizontal strip that widens the page body is
          the classic way a phone layout starts scrolling sideways. */}
      <ul className="mt-4 flex gap-3 overflow-x-auto pb-2" data-testid="cart-suggestions">
        {suggestions.map((card) => (
          <li key={card.slug} className="w-56 shrink-0">
            <Link
              href={`/catalog/${card.category_slug}/${card.slug}`}
              className="group flex h-full flex-col rounded-card border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-hover"
            >
              <h3 className="text-balance text-sm font-semibold text-text group-hover:text-text-link">
                {card.name}
              </h3>
              <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                {card.short_description}
              </p>

              <div className="mt-auto flex items-baseline gap-2 pt-3">
                <span className="text-[0.6875rem] uppercase tracking-[0.08em] text-text-muted">
                  Starts at
                </span>
                <span data-numeric className="text-base font-bold text-text">
                  {formatMoney(card.starting_price.amount_paise)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
