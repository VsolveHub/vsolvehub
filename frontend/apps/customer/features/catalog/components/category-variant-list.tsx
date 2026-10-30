import { IntentLink } from "@/components/intent-link";
import { EmptyState, formatMoney } from "@vsolve/ui";

import { iconForService } from "../icon-catalogue/service-icon";
import { groupServicesBySubcategory } from "../grouping";
import type { Category, ServiceDetail } from "../queries";
import { variantRows } from "../variant-rows";

/**
 * The category's detail listing: every service, with every variant under it.
 *
 * The catalogue page answers "what do you do?" with an icon and a name; this
 * page answers the next question — "what exactly, and from how much?" — the
 * way the M2 artboards' rate cards do. Each service is a card headed by its
 * icon and name; inside it, one row per variant with the name on the left and
 * the money column on the right. A priced A1 variant prints its starting
 * price; an A3 crew variant prints "Day rate"; an A5 project prints "Priced
 * on site", because a number there would be one the platform invented.
 *
 * Rows are links, and each goes where its archetype starts: the service's
 * booking page, the crew form, or the three-step brief. `variantRows` owns
 * that mapping; this file only draws it.
 *
 * Server-rendered throughout — the page is a list of links, and hydrating a
 * rate card to buy nothing is the same cost FE-9 ruled out on the catalogue.
 */

export interface CategoryVariantListProps {
  category: Category;
  services: readonly ServiceDetail[];
}

export function CategoryVariantList({ category, services }: CategoryVariantListProps) {
  if (services.length === 0) {
    return (
      <EmptyState
        title="No services in this category yet"
        description="We are still adding services here. Try another category in the meantime."
      />
    );
  }

  const { groups, ungrouped } = groupServicesBySubcategory(
    services,
    category.subcategories,
    null,
  );

  // `groupServicesBySubcategory` narrows to `ServiceCard`; recover the details
  // by identity so the sections keep the full variant payload.
  const bySlug = new Map(services.map((service) => [service.slug, service]));

  const sections = [
    ...groups.map((group) => ({
      key: group.subcategory.id,
      name: group.subcategory.name,
      services: group.services,
    })),
    ...(ungrouped.length > 0
      ? [{ key: "ungrouped", name: "More in this category", services: ungrouped }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <h2 className="flex-1 text-[13px] font-bold uppercase tracking-[0.06em] text-text-muted">
              {section.name}
            </h2>
            <span className="shrink-0 text-[11px] font-bold text-text-muted">
              {section.services.length === 1
                ? "1 service"
                : `${section.services.length} services`}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {section.services.map((card) => {
              const service = bySlug.get(card.slug);
              if (service === undefined) return null;
              const Icon = iconForService(service.icon_key);
              const rows = variantRows(service, category.slug);

              return (
                <article
                  key={service.id}
                  className="overflow-hidden rounded-card border border-line bg-surface"
                >
                  <div className="flex items-center gap-3 px-3.5 pb-2.5 pt-3.5">
                    <span
                      aria-hidden
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-text-secondary"
                    >
                      <Icon size={20} strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-bold leading-snug tracking-tight text-text">
                        {service.name}
                      </h3>
                      {service.short_description ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">
                          {service.short_description}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {rows.length === 0 ? (
                    // A published service with nothing bookable and nothing to
                    // quote is a data problem; say so quietly rather than
                    // painting a card that goes nowhere.
                    <p className="border-t border-line px-3.5 py-3 text-xs text-text-muted">
                      Not bookable right now.
                    </p>
                  ) : (
                    <ul className="list-none">
                      {rows.map((row) => (
                        <li key={row.key} className="border-t border-line">
                          <IntentLink
                            href={row.href}
                            className={[
                              "flex min-h-11 items-center gap-3 px-3.5 py-2.5",
                              "transition-[background-color] duration-fast ease-out",
                              "hover:bg-surface-hover active:bg-surface-sunken",
                              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
                            ].join(" ")}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-text">
                                {row.name}
                              </span>
                              {row.description ? (
                                <span className="mt-0.5 block truncate text-[11.5px] text-text-muted">
                                  {row.description}
                                </span>
                              ) : null}
                            </span>

                            {row.price !== null ? (
                              <span className="shrink-0 text-right">
                                <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
                                  From
                                </span>
                                <span
                                  data-numeric
                                  className="block text-[15px] font-extrabold tabular-nums leading-tight text-text"
                                >
                                  {formatMoney(row.price.amount_paise)}
                                </span>
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-action-surface px-2.5 py-1 text-[10.5px] font-bold text-navy-900">
                                {row.priceNote}
                              </span>
                            )}

                            <svg
                              viewBox="0 0 20 20"
                              fill="none"
                              aria-hidden
                              className="size-4 shrink-0 text-text-muted"
                            >
                              <path
                                d="m7.5 5 5 5-5 5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </IntentLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
