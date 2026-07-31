import Link from "next/link";
import { Badge, formatMoney } from "@vsolve/ui";

import type { ServiceCard as ServiceCardData } from "../queries";

/**
 * A service in a list.
 *
 * Shows only what helps someone decide (plan 03): what it is, what it starts at,
 * how long it usually takes. No rating unless real review data exists — an
 * invented "4.8 ★" on a catalogue with no completed bookings is exactly the
 * fabricated-trust signal plan 08 recorded as a defect in the partner app.
 *
 * The price comes from `starting_price`, which Django derives from the same
 * active `ServiceRate` the quote engine uses. The card cannot compute or round
 * a price of its own, which is what keeps the catalogue and the quote in
 * agreement (B2 acceptance).
 */
export function ServiceCard({
  service,
  categorySlug,
}: {
  service: ServiceCardData;
  categorySlug: string;
}) {
  const hours = service.recommended_duration_minutes / 60;
  const duration =
    service.recommended_duration_minutes >= 60 && Number.isInteger(hours)
      ? `${hours} hr`
      : `${service.recommended_duration_minutes} min`;

  return (
    <Link
      href={`/catalog/${categorySlug}/${service.slug}`}
      className="group flex flex-col rounded-card border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-hover"
    >
      {/* Most of the catalogue has no cover art. A grey placeholder box would
          add weight and nothing else, so the card is text-first and simply
          renders the image when one exists. */}
      <h3 className="text-balance font-semibold text-text group-hover:text-text-link">
        {service.name}
      </h3>

      <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{service.short_description}</p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-1">
        <span className="text-xs uppercase tracking-[0.08em] text-text-muted">Starts at</span>
        <span data-numeric className="text-lg font-bold text-text">
          {formatMoney(service.starting_price.amount_paise)}
        </span>
        <Badge tone="neutral">{duration} typical</Badge>
      </div>
    </Link>
  );
}
