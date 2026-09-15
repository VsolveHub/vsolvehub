import type { ServiceCard } from "./queries";
import {
  isCareerJobsCategory,
  isRentalCategory,
  isStayCategory,
  listingsBrowseHref,
  rentalsBrowseHref,
  staysBrowseHref,
} from "@/lib/routes";

/**
 * Where tapping a service goes.
 *
 * Career/Jobs → `/listings`. Rental → `/rentals`. Stay → `/stays`.
 * Never cart, `/book/`, or `/requests/` for those archetypes.
 */
const A3_TIME_BLOCK = "A3_TIME_BLOCK";
const A7_RENTAL = "A7_RENTAL";
const A9_STAY = "A9_STAY";
const A10_LISTING = "A10_LISTING";

export function serviceHref(service: ServiceCard, categorySlug: string): string {
  if (service.request_archetypes.includes(A10_LISTING) || isCareerJobsCategory(categorySlug)) {
    return listingsBrowseHref(service.slug);
  }
  if (service.request_archetypes.includes(A7_RENTAL) || isRentalCategory(categorySlug)) {
    return rentalsBrowseHref(service.slug);
  }
  if (service.request_archetypes.includes(A9_STAY) || isStayCategory(categorySlug)) {
    return staysBrowseHref(service.slug);
  }

  const hasFixedPrice = service.starting_price !== null || service.bookable_variant_id !== null;
  if (service.request_archetypes.length > 0 && hasFixedPrice) {
    return `/catalog/${categorySlug}/${service.slug}`;
  }
  if (service.request_archetypes.includes(A3_TIME_BLOCK)) {
    return `/requests/book/${service.slug}`;
  }
  if (service.request_archetypes.length > 0) return `/requests/new/${service.slug}`;
  return `/catalog/${categorySlug}/${service.slug}`;
}
