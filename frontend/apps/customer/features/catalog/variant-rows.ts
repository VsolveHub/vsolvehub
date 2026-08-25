import type { Schemas } from "@vsolve/api-client";

import type { ServiceDetail } from "./queries";

/**
 * One service's variants, flattened into the rows the category page prints.
 *
 * A `ServiceDetail` carries its variants in two halves that the contract keeps
 * deliberately separate: `variants` is the priced A1 task list, each row backed
 * by a published rate, and `requirement_variants` is the A3/A5 half, whose
 * price is the vendor's quote and therefore has no number the platform could
 * honestly print. The category page shows both under one service heading, so
 * this folds them into one row shape — and it is a plain function, not a
 * component, because "which rows, in which order, going where" is the part of
 * that page worth pinning with a test.
 *
 * ## Ordering
 *
 * Priced rows first, in the server's own order, then the requirement variants.
 * A customer scanning a rate card reads numbers before "priced on site"; the
 * quote-based rows close each card the way "Get a quote" closes a rate card.
 *
 * ## Where a row goes
 *
 * The same routing rule as `serviceHref`, applied per variant rather than per
 * service: an A3 time block opens the crew form, any other guided archetype
 * opens the three-step brief, and a priced A1 row opens the service's own page,
 * where the booking workspace prices tasks properly. The unknown-archetype
 * fallback is the brief because a guided variant this client does not recognise
 * is still a guided variant — sending it to a page that cannot start it would
 * strand exactly the services a newer contract added.
 */

const A3_TIME_BLOCK = "A3_TIME_BLOCK";

export type Money = Schemas["Money"];

export interface VariantRow {
  key: string;
  name: string;
  /** May be empty; the row renders nothing rather than inventing copy. */
  description: string;
  /** The published starting price, or `null` when the honest answer is a quote. */
  price: Money | null;
  /** What stands where the price would — "Day rate", "Priced on site". */
  priceNote: string | null;
  href: string;
}

export function variantRows(service: ServiceDetail, categorySlug: string): VariantRow[] {
  const priced = service.variants.map(
    (variant): VariantRow => ({
      key: variant.id,
      name: variant.name,
      description: variant.description,
      price: variant.starting_price,
      priceNote: null,
      href: `/catalog/${categorySlug}/${service.slug}`,
    }),
  );

  const guided = service.requirement_variants.map(
    (variant): VariantRow => ({
      key: variant.id,
      name: variant.name,
      description: variant.description,
      price: null,
      priceNote: variant.fulfilment_archetype === A3_TIME_BLOCK ? "Day rate" : "Priced on site",
      href:
        variant.fulfilment_archetype === A3_TIME_BLOCK
          ? `/requests/book/${service.slug}`
          : `/requests/new/${service.slug}`,
    }),
  );

  return [...priced, ...guided];
}
