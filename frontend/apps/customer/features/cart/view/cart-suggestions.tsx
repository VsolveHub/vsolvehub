"use client";

import { Button, formatMoney, ProgressiveImage } from "@vsolve/ui";
import Link from "next/link";

import { ServicePhoto } from "@/features/catalog/components/category-artwork";
import { isServiceCoverUrl } from "@/features/catalog/service-cover";
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
 * ## Add here, choose there
 *
 * A `ServiceCard` names a service, not a variant, so whether one tap is honest
 * depends on whether there is anything to decide. The server answers that with
 * `bookable_variant_id`: set when exactly one variant is active, null when there
 * are several.
 *
 * With one variant, Add adds it at quantity one — the scope is a quantity that
 * already defaults to one, so nothing is invented and the cart is where the
 * customer was already standing. With several, the card opens the service
 * instead: picking between a repair and a 32-amp replacement, or a 1 BHK and a
 * villa, is the customer's decision, and guessing it would put a price on screen
 * for a job they never described.
 *
 * Renders `null` when the list is empty. There is deliberately no fallback row:
 * a cart with nothing compatible has nothing to say here, and filling the gap
 * with popular services would turn the heading into a promise that breaks when a
 * second professional turns up.
 */
export interface CartSuggestionsProps {
  suggestions: readonly ServiceCard[];
  onAdd: (variantId: string) => void;
  addingVariantId: string | null;
  isAdding: boolean;
}

export function CartSuggestions({
  suggestions,
  onAdd,
  addingVariantId,
  isAdding,
}: CartSuggestionsProps) {
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
        {suggestions.map((card) => {
          const imageUrl = card.cover?.url ?? "";
          const isCoverIcon = imageUrl
            ? isServiceCoverUrl(imageUrl) || imageUrl.includes("/catalog/tiles/")
            : false;

          return (
            <li
              key={card.slug}
              className="flex w-56 shrink-0 flex-col rounded-card border border-line bg-surface p-3 sm:p-4"
            >
              <Link
                href={`/catalog/${card.category_slug}/${card.slug}`}
                className="group min-w-0 flex flex-col flex-1"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-[#F4F1EC] mb-3">
                  {imageUrl ? (
                    <ProgressiveImage
                      src={imageUrl}
                      alt={card.cover?.alt_text || card.name}
                      containerClassName="size-full"
                      className={
                        isCoverIcon
                          ? "size-full object-contain p-3 transition-transform duration-300 group-hover:scale-105"
                          : "size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      }
                    />
                  ) : (
                    <div className="size-full bg-surface-sunken grid place-items-center text-text-secondary">
                      <ServicePhoto imageUrl="" iconKey={card.icon_key} className="size-full rounded-none shadow-none" />
                    </div>
                  )}
                </div>

                <h3 className="text-balance text-sm font-semibold text-text group-hover:text-text-link">
                  {card.name}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                  {card.short_description}
                </p>
              </Link>

              <div className="mt-auto pt-3">
              {/*
                Suggestions come from a rate-gated selector, so a card here always has a price —
                `public_services_by_id` deliberately kept the rate gate the catalog listing dropped,
                because a suggestion is an "add this to your visit" affordance and a service quoted
                per job cannot be added to a cart. The guard is belt-and-braces: if that ever
                changes, the price line disappears rather than the card crashing.
              */}
              {card.starting_price !== null ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-[0.6875rem] uppercase tracking-[0.08em] text-text-muted">
                    Starts at
                  </span>
                  <span data-numeric className="text-base font-bold text-text">
                    {formatMoney(card.starting_price.amount_paise)}
                  </span>
                </div>
              ) : null}

              {card.bookable_variant_id !== null ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2 w-full"
                  // Only this card's button shows the spinner. A shared flag would put one on
                  // every card and imply the whole strip was busy.
                  loading={isAdding && addingVariantId === card.bookable_variant_id}
                  disabled={isAdding}
                  onClick={() => onAdd(card.bookable_variant_id as string)}
                >
                  Add<span className="sr-only"> {card.name} to your cart</span>
                </Button>
              ) : (
                <Link
                  href={`/catalog/${card.category_slug}/${card.slug}`}
                  className="mt-2 block rounded-md border border-line-strong px-3 py-1.5 text-center text-xs font-semibold text-text hover:bg-surface-hover"
                >
                  Choose an option<span className="sr-only"> for {card.name}</span>
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
    </section>
  );
}
