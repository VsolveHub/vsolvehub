import Link from "next/link";
import { formatMoney } from "@vsolve/ui";

import { bookingModeLabel } from "../search";
import type { Category, ServiceCard as ServiceCardData } from "../queries";
import { serviceHref } from "../service-href";

/**
 * One service as a **line on a rate card**, not a product tile.
 *
 * ## Why a row and not the card we already have
 *
 * `ServiceCard` is a browse object: it sells one thing inside its own category,
 * where the reader has already chosen the trade. Search results are the
 * opposite job — a mixed list from across the catalogue, where the reader is
 * comparing, and the two questions are "is this the thing I meant" and "what
 * does it cost". A grid of equal-weight tiles answers neither quickly; the eye
 * has to traverse each tile to find the price.
 *
 * So the results read down a single column with the prices aligned in one
 * right-hand rail. That is a deliberate departure from how a marketplace
 * usually renders search — it is the shape of a printed rate card, which is
 * also the promise this product makes on its front page: see the price before
 * you book. It looks like nobody else's search results because it is answering
 * the question this product is about.
 *
 * ## What is not on it
 *
 * No rating, no review count, no "N bookings this week", no cover photograph.
 * The first three are not in the contract at all and inventing them is the
 * fabricated-trust defect `EmptyState` and `ServiceCard` both already carry
 * warnings about. The photograph is left off because a cover image is decoration
 * in a comparison list and it is what forces the tile grid in the first place.
 */
export function ServiceRow({
  service,
  category,
}: {
  service: ServiceCardData;
  category: Category;
}) {
  const mode = bookingModeLabel(service);

  return (
    <li>
      <Link
        href={serviceHref(service, category.slug)}
        prefetch={false}
        className="group relative flex items-stretch gap-4 rounded-card border border-line bg-surface px-4 py-4 transition-colors duration-fast hover:border-navy-300 hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:gap-6 sm:px-5"
      >
        {/* The accent rail: the app's own "this one is live" motif, used on
            category tiles and the operations queues. Grows rather than appears,
            so a pointer moving down the list does not strobe. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-3 left-0 w-0.5 origin-center scale-y-0 rounded-full bg-action transition-transform duration-fast group-hover:scale-y-100 group-focus-visible:scale-y-100 motion-reduce:transition-none"
        />

        <div className="min-w-0 flex-1 pl-1">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-text-muted">
            {category.name}
          </p>
          <h3 className="mt-1 text-balance text-[1.0625rem] font-bold leading-snug text-navy-900 transition-colors group-hover:text-action">
            {service.name}
          </h3>
          {service.short_description ? (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-text-secondary">
              {service.short_description}
            </p>
          ) : null}
        </div>

        {/* The price rail. `text-right` and `tabular-nums` together are what let
            the column be read down as a list of numbers rather than scanned. */}
        <div className="flex shrink-0 flex-col items-end justify-center text-right">
          {mode ? (
            <span className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-text-muted">
              {mode}
            </span>
          ) : null}

          {service.starting_price !== null ? (
            <span
              data-numeric
              className="mt-1 block text-[1.0625rem] font-extrabold tabular-nums leading-none text-navy-900 sm:text-lg"
            >
              {formatMoney(service.starting_price.amount_paise)}
            </span>
          ) : null}

          <span
            aria-hidden="true"
            className="mt-2 grid size-7 place-items-center rounded-full bg-surface-sunken text-text-muted transition-all duration-fast group-hover:translate-x-0.5 group-hover:bg-action-surface group-hover:text-navy-900 motion-reduce:transform-none"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
              <path
                d="M4 10h11m-4-4 4 4-4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </Link>
    </li>
  );
}
