import "server-only";

import { cache } from "react";

import { getCategories, getServicesByCategory } from "../queries";
import { serviceHref } from "../service-href";

/**
 * Where each catalogue tile goes, keyed by service slug.
 *
 * ## Why the index row cannot answer this itself
 *
 * `ServiceIndexItem` is deliberately tiny — identity, ordering, an icon key —
 * and it does not carry `request_archetypes`. But the tile's destination
 * depends on exactly that field: an A3 time-block service goes straight to the
 * crew form, any other guided archetype goes straight to the three-step brief,
 * and only a plain bookable service opens its own catalogue page. That routing
 * rule already exists in `serviceHref` and is the server's own list, not a
 * guess; see the comment there for why the guided lifecycles skip the service
 * page.
 *
 * So the catalogue merges two reads it was already entitled to: the flat index
 * for what to *render*, and the per-category `ServiceCard` fan-out — the same
 * cached, `catalog`-tagged requests the search path uses — for where each tile
 * *goes*. No new endpoint, no contract change, and both halves invalidate with
 * the same publish.
 *
 * ## The fallback is the service page
 *
 * A slug in the index but missing from the fan-out can only happen mid-publish
 * or across a cache-expiry seam. The detail page is the one destination that is
 * always correct — it renders for every service and itself offers the right
 * next step — so an unmatched tile degrades to that rather than to a dead link.
 */
export const getServiceHrefs = cache(async (): Promise<ReadonlyMap<string, string>> => {
  const categories = await getCategories();
  const servicesByCategory = await getServicesByCategory(categories);

  const hrefs = new Map<string, string>();
  for (const [categorySlug, services] of servicesByCategory) {
    for (const service of services) {
      hrefs.set(service.slug, serviceHref(service, categorySlug));
    }
  }
  return hrefs;
});
