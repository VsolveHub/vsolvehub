import { Badge, formatMoney } from "@vsolve/ui";

import type { ServiceDetail } from "../queries";

/**
 * The bookable units of a service.
 *
 * A service is the marketable offering; a variant is what actually gets priced
 * and booked (plan 02). "Switch / Socket Repair" is the service; its variants
 * cost different amounts, and listing them is what stops the catalogue implying
 * a single price for work that has several.
 *
 * Contract 1.6.0 replaced `pricing_strategy` and the duration-picker fields with
 * the A1 shape: a minimum service subtotal and the task lines a customer can
 * choose. So the note under each variant now says what actually governs the
 * price — the minimum visit charge — instead of naming a strategy enum that no
 * longer exists. Task lines themselves belong to the booking workspace (FE-08),
 * not to a catalogue card.
 */

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
              {variant.task_lines.length > 0
                ? `${variant.task_lines.length} task${variant.task_lines.length === 1 ? "" : "s"} you can choose from`
                : "Priced on booking"}
            </p>
          </div>

          <div className="text-right">
            <span className="block text-xs uppercase tracking-[0.08em] text-text-muted">
              Starts at
            </span>
            <span data-numeric className="text-lg font-bold text-text">
              {formatMoney(variant.starting_price.amount_paise)}
            </span>
            {/* The minimum visit charge is the number a customer is actually
                held to when they pick one small task, so it is disclosed here
                rather than discovered at review. */}
            {variant.minimum_service_subtotal.amount_paise >
            variant.starting_price.amount_paise ? (
              <Badge tone="neutral" className="mt-1">
                Min {formatMoney(variant.minimum_service_subtotal.amount_paise)}
              </Badge>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
