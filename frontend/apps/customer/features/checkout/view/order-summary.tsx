"use client";

import type { Schemas } from "@vsolve/api-client";

import type { Cart, GroupQuote, SchedulingGroup } from "../queries";
import { Money } from "./money";
import { formatServiceDuration } from "./duration";

/**
 * What is being booked, and what it costs.
 *
 * Two states, and the difference between them is honest rather than cosmetic.
 * Before every visit has a time there is **no price to show** — the planner
 * cannot price work it cannot schedule, and `CartItemDetail` carries no amount
 * precisely so that no screen can imply one. The summary lists the work and says
 * plainly that pricing comes after the times.
 *
 * Once a quote exists, every amount on screen is one of its fields. Nothing is
 * summed here: the server allocated the platform fee across units in paise and
 * sent both the allocation and the total, so the rail renders them side by side
 * without needing them to agree by construction.
 */

/** Line-kind copy, keyed by the generated enum so a new kind is a type error. */
const LINE_KIND_HINTS: Record<Schemas["QuoteLineKindEnum"], string | null> = {
  SERVICE: null,
  MINIMUM_VISIT_ADJUSTMENT: "Minimum charge for this visit",
  PLATFORM_FEE_ALLOCATION: "This visit's share of the platform fee",
};

export interface OrderSummaryProps {
  cart: Cart;
  groups: readonly SchedulingGroup[];
  quote: GroupQuote | null;
}

export function OrderSummary({ cart, groups, quote }: OrderSummaryProps) {
  return (
    <div className="flex flex-col gap-4">
      {quote === null ? (
        <UnpricedSummary cart={cart} groups={groups} />
      ) : (
        <PricedSummary quote={quote} />
      )}
    </div>
  );
}

/**
 * The work, before it can be priced.
 *
 * Grouped by visit when the server has published a grouping, because that is the
 * shape the booking will actually take and showing a flat list first would make
 * the visits look like something checkout introduced later.
 */
function UnpricedSummary({ cart, groups }: { cart: Cart; groups: readonly SchedulingGroup[] }) {
  const grouped =
    groups.length > 0
      ? groups.map((group) => ({
          key: group.key,
          heading: group.label,
          note: `Approx. ${formatServiceDuration(group.estimated_duration_minutes)}`,
          items: cart.items.filter((item) => group.cart_item_ids.includes(item.id)),
        }))
      : [{ key: "all", heading: "Your services", note: null, items: cart.items }];

  return (
    <>
      {grouped.map((section) => (
        <section
          key={section.key}
          className="rounded-card border border-line bg-surface p-5"
          aria-labelledby={`summary-${section.key}`}
        >
          <h3 id={`summary-${section.key}`} className="text-base font-bold text-text">
            {section.heading}
          </h3>
          {section.note === null ? null : (
            <p className="mt-0.5 text-sm text-text-secondary">{section.note}</p>
          )}

          <ul className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
            {section.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 text-sm">
                <span className="text-text">
                  {item.service_name}
                  <span className="block text-text-secondary">{item.variant_name}</span>
                </span>
                {item.quantity > 1 ? (
                  <span className="shrink-0 tabular-nums text-text-secondary">
                    × {item.quantity}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="rounded-card border border-line bg-surface-sunken p-4 text-sm text-text-secondary">
        We work out the price once every visit has a time — it depends on how many
        professionals your booking needs.
      </p>
    </>
  );
}

/** The immutable quote: one card per visit, then the bill. */
function PricedSummary({ quote }: { quote: GroupQuote }) {
  return (
    <>
      {quote.units.map((unit, index) => (
        <section
          key={unit.id}
          className="rounded-card border border-line bg-surface p-5"
          aria-labelledby={`summary-unit-${unit.id}`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`summary-unit-${unit.id}`} className="text-base font-bold text-text">
              Visit {index + 1} of {quote.units.length}
            </h3>
            <Money value={unit.total} className="text-sm font-semibold tabular-nums text-text" />
          </div>

          <p className="mt-0.5 text-sm text-text-secondary">
            <time dateTime={unit.starts_at}>
              {new Date(unit.starts_at).toLocaleString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
            {" · "}
            {unit.arrival_window_minutes} min arrival window
          </p>

          <dl className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-sm">
            {unit.lines.map((line) => {
              const hint = LINE_KIND_HINTS[line.kind];
              return (
                <div key={line.id} className="flex justify-between gap-3">
                  <dt className="text-text">
                    {line.label}
                    {line.quantity > 1 ? (
                      <span className="text-text-secondary"> × {line.quantity}</span>
                    ) : null}
                    {hint ? <span className="block text-text-secondary">{hint}</span> : null}
                  </dt>
                  <dd className="shrink-0 tabular-nums text-text">
                    <Money value={line.amount} />
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}

      <section
        className="rounded-card border border-line-strong bg-surface p-5"
        aria-labelledby="summary-total"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="summary-total" className="text-base font-bold text-text">
            Total bill
          </h3>
          <Money value={quote.total} className="text-xl font-bold tabular-nums text-text" />
        </div>
        <p className="mt-1 text-sm text-text-secondary">Includes taxes and charges.</p>

        {/* Native disclosure: the breakup is already on screen above, so this is
            a summary of it rather than a second source of numbers. */}
        {quote.units.length > 1 ? (
          <details className="mt-4 border-t border-line pt-4">
            <summary className="cursor-pointer text-sm font-medium text-text-link">
              View breakup
            </summary>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              {quote.units.map((unit, index) => (
                <div key={unit.id} className="flex justify-between gap-3">
                  <dt className="text-text-secondary">Visit {index + 1}</dt>
                  <dd className="tabular-nums text-text">
                    <Money value={unit.total} />
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </section>
    </>
  );
}
