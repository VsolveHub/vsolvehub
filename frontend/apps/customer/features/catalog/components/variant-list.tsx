import { Badge, formatMoney } from "@vsolve/ui";

import { AddToCartButton } from "./add-to-cart-button";
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

/**
 * Each row books itself.
 *
 * A service can now be sold several ways at several prices — a repair against a 32-amp
 * replacement, a 1 BHK against a villa — and a list that showed those prices while offering one
 * shared button made the reader choose twice: once here, and again inside the workspace, with no
 * sign the first choice had been carried. The link carries `?variant=<code>`, which
 * `/book/[service]` already resolves.
 *
 * A link, not a button: middle-click and "open in new tab" then behave the way the browser
 * promises, and comparing two options in two tabs is exactly what somebody does here.
 */
export function VariantList({
  variants,
  serviceSlug,
}: {
  variants: ServiceDetail["variants"];
  serviceSlug: string;
}) {
  // One variant is not a choice. The page's own primary action already books it, so a second
  // control saying the same thing would imply an option that is not there.
  const isChoice = variants.length > 1;

  return (
    <ul className="mt-4 space-y-4">
      {variants.map((variant) => (
        <li key={variant.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-5 rounded-[0.75rem] bg-[#F4F2EE]">
          <div className="min-w-0 flex-1">
            <p className="text-[1.05rem] font-medium text-navy-900">{variant.name}</p>
            {variant.description ? (
              <p className="mt-2.5 text-[0.9rem] leading-relaxed text-text-secondary">{variant.description}</p>
            ) : null}
            <p className="mt-3.5 text-[0.85rem] italic text-text-muted/90">
              {variant.task_lines.length > 0
                ? `${variant.task_lines.length} task${variant.task_lines.length === 1 ? "" : "s"} you can choose from`
                : "Priced on booking"}
            </p>
          </div>

          <div className="text-left sm:text-right sm:pl-6 sm:ml-4 sm:border-l sm:border-line/40 flex sm:flex-col items-center sm:items-end justify-between sm:justify-start">
            <div className="text-left sm:text-right">
              <span className="block text-[0.65rem] uppercase font-bold tracking-wider text-text-muted">
                Starts at
              </span>
              <span data-numeric className="mt-0.5 block text-[1.1rem] font-bold tabular-nums text-navy-900">
                {formatMoney(variant.starting_price.amount_paise)}
              </span>
            </div>
            {/* The minimum visit charge is the number a customer is actually
                held to when they pick one small task, so it is disclosed here
                rather than discovered at review. */}
            {variant.minimum_service_subtotal.amount_paise >
            variant.starting_price.amount_paise ? (
              <Badge tone="neutral" className="mt-1">
                Min {formatMoney(variant.minimum_service_subtotal.amount_paise)}
              </Badge>
            ) : null}

            {isChoice ? (
              <div className="mt-3 flex w-full flex-col gap-2 sm:mt-2 sm:w-auto sm:items-end">
                <AddToCartButton
                  variantId={variant.id}
                  size="compact"
                  className="w-full sm:w-auto"
                />
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
