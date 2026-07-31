import { Badge, formatMoney } from "@vsolve/ui";

import type { ServiceDetail } from "../queries";

/**
 * The bookable units of a service.
 *
 * A service is the marketable offering; a variant is what actually gets priced
 * and booked (plan 02). "Switch / Socket Repair" is the service; "Inspection",
 * "Repair one switch" and "Replace switch" are variants, and they cost
 * different amounts. Listing them here is what stops the catalogue implying a
 * single price for work that has three.
 *
 * `pricing_strategy` is shown because it changes what the number means:
 *   FIXED      the price for the job
 *   DURATION   the price for the first booked block, more time costs more
 *   INSPECTION a visit fee; the repair is quoted after someone has looked
 *
 * Leaving that unsaid is how an inspection fee gets mistaken for the total.
 */

const STRATEGY_NOTE: Record<string, string> = {
  FIXED: "Fixed price for the job",
  DURATION: "Priced by time booked",
  INSPECTION: "Visit fee — repair quoted after inspection",
};

export function VariantList({ variants }: { variants: ServiceDetail["variants"] }) {
  return (
    <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-surface">
      {variants.map((variant) => (
        <li key={variant.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text">{variant.name}</p>
            {variant.description ? (
              <p className="mt-0.5 text-sm text-text-secondary">{variant.description}</p>
            ) : null}
            <p className="mt-1.5 text-xs text-text-muted">
              {STRATEGY_NOTE[variant.pricing_strategy] ?? "Priced on booking"}
              {variant.pricing_strategy === "DURATION"
                ? ` · from ${variant.minimum_duration_minutes} min`
                : ""}
            </p>
          </div>

          <div className="text-right">
            <span className="block text-xs uppercase tracking-[0.08em] text-text-muted">
              {variant.pricing_strategy === "FIXED" ? "Price" : "Starts at"}
            </span>
            <span data-numeric className="text-lg font-bold text-text">
              {formatMoney(variant.starting_price.amount_paise)}
            </span>
            {variant.pricing_strategy === "INSPECTION" ? (
              <Badge tone="info" className="mt-1">
                Inspection
              </Badge>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
