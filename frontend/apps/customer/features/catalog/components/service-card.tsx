import Link from "next/link";
import { formatMoney } from "@vsolve/ui";

import type { ServiceCard as ServiceCardData } from "../queries";

/**
 * A service in a list.
 *
 * Shows only what helps someone decide (plan 03): what it is and what it starts
 * at. The "typical duration" badge is gone — contract 1.6.0 removed
 * `recommended_duration_minutes` from the card because A1 is task-priced and the
 * server derives an estimate from the tasks a customer actually picks. A single
 * number here would have been a guess about work nobody has described yet.
 *
 * No rating unless real review data exists — an invented "4.8 ★" on a catalogue
 * with no completed bookings is exactly the fabricated-trust signal plan 08
 * recorded as a defect in the partner app.
 *
 * The price comes from `starting_price`, which Django derives from the same
 * active `ServiceRate` the quote engine uses. The card cannot compute or round
 * a price of its own, which is what keeps the catalogue and the quote in
 * agreement (B2 acceptance).
 */
/**
 * Where tapping this card goes.
 *
 * ## Why the guided lifecycles skip the service page
 *
 * An A1 service genuinely needs its own page: there are tasks to pick, a price
 * that depends on which, and availability to check. A guided requirement has
 * none of that. Its service page carried a paragraph and a single button whose
 * only job was to say "continue" — an interstitial between the customer choosing
 * a service and the screen that asks about it, which on a phone is a whole
 * screen spent on a tap.
 *
 * So A3 goes straight to the crew form and A5 straight to the brief. The service
 * page still exists and still works for anyone who deep-links to it; it simply
 * stops being on the path.
 *
 * `request_archetypes` is the server's own list, which is what makes this a
 * routing decision rather than a guess: `bookable_variant_id` marks the A1 path
 * and nothing marked the others until this field was published.
 */
const A3_TIME_BLOCK = "A3_TIME_BLOCK";

export function serviceHref(service: ServiceCardData, categorySlug: string): string {
  if (service.request_archetypes.includes(A3_TIME_BLOCK)) {
    return `/requests/book/${service.slug}`;
  }
  if (service.request_archetypes.length > 0) return `/requests/new/${service.slug}`;
  return `/catalog/${categorySlug}/${service.slug}`;
}

export function ServiceCard({
  service,
  categorySlug,
}: {
  service: ServiceCardData;
  categorySlug: string;
}) {
  return (
    <Link
      href={serviceHref(service, categorySlug)}
      className="group flex flex-col rounded-card border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-hover"
    >
      {/* Most of the catalogue has no cover art. A grey placeholder box would
          add weight and nothing else, so the card is text-first and simply
          renders the image when one exists. */}
      <h3 className="text-balance font-semibold text-text group-hover:text-text-link">
        {service.name}
      </h3>

      <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{service.short_description}</p>

      {/*
        Two catalogs, one card. A priced service shows what it starts at; a service you *describe*
        has no price to show, because the price is whatever a vendor quotes after reading the job.
        Rendering "Starts at —" or a zero would be inventing the number this whole lifecycle exists
        to avoid, so the card says what happens next instead.
      */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-1">
        {service.starting_price !== null ? (
          <>
            <span className="text-xs uppercase tracking-[0.08em] text-text-muted">Starts at</span>
            <span data-numeric className="text-lg font-bold text-text">
              {formatMoney(service.starting_price.amount_paise)}
            </span>
          </>
        ) : (
          <span className="text-sm font-semibold text-text">Tell us what you need</span>
        )}
      </div>
    </Link>
  );
}
