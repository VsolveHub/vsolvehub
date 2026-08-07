import type { Category, ServiceCard } from "./queries";

/**
 * Which services belong under which subcategory, and which of those to show.
 *
 * Pulled out of the page because it is the whole of the defect that made a category page ignore
 * its own subcategory links: the page rendered one flat grid of every service while the chips
 * pointed at `#<slug>` anchors that existed nowhere, so choosing "Septic Tank Services" left all
 * sixty-two Home services on screen and moved nothing.
 *
 * Grouping happens here rather than in the API because `ServiceCard` already carries
 * `subcategory_slug`. A second endpoint would be a second source of truth for the same answer.
 */

export interface ServiceGroup {
  subcategory: Category["subcategories"][number];
  services: ServiceCard[];
}

export interface GroupedServices {
  groups: ServiceGroup[];
  /**
   * Services whose `subcategory_slug` is in no subcategory the category published.
   *
   * Rendered under a plain heading rather than dropped. A service that exists, is active and is
   * returned by the API but appears on no page is unreachable stock — worse than an untidy
   * grouping, and invisible to whoever would otherwise fix the data.
   */
  ungrouped: ServiceCard[];
}

export function groupServicesBySubcategory(
  services: readonly ServiceCard[],
  subcategories: Category["subcategories"],
  activeTrade: string | null,
): GroupedServices {
  const groups = subcategories
    .filter((subcategory) => activeTrade === null || subcategory.slug === activeTrade)
    .map((subcategory) => ({
      subcategory,
      services: services.filter((service) => service.subcategory_slug === subcategory.slug),
    }))
    // Empty groups are dropped while browsing so the page has no headings with nothing under
    // them. When a trade was explicitly asked for, the empty group is kept: "this one has
    // nothing in it" is the honest answer to that request, and silently widening back to the
    // full list is what the old page did.
    .filter((group) => group.services.length > 0 || activeTrade !== null);

  return {
    groups,
    // Only while browsing. Under a filter the reader asked one question, and answering it with
    // services from elsewhere in the category would be answering a different one.
    ungrouped:
      activeTrade === null
        ? services.filter(
            (service) =>
              !subcategories.some(
                (subcategory) => subcategory.slug === service.subcategory_slug,
              ),
          )
        : [],
  };
}
