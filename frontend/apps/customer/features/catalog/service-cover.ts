import type { ServiceCard } from "./client-queries";

/**
 * How a booking, request or engagement finds the catalogue cover already used
 * on the service listing and detail pages.
 *
 * There is deliberately no second image map. A booking line codes the service
 * as `task.{slug}`; a workforce engagement publishes `service_slug`; a quote
 * request only has the catalogue name (and optionally its category). All three
 * resolve against the same `ServiceCard` list the category pages already fetch.
 */

export type CatalogServiceHint = {
  slug?: string | null;
  name?: string | null;
  categorySlug?: string | null;
};

export function serviceSlugFromLineCode(code: string): string | null {
  const trimmed = code.trim();
  if (trimmed.startsWith("task.")) {
    const slug = trimmed.slice("task.".length).trim();
    return slug.length > 0 ? slug : null;
  }
  return null;
}

export function isServiceCoverUrl(imageUrl: string): boolean {
  return imageUrl.includes("/Service%20Cover/") || imageUrl.includes("/Service Cover/");
}

function normaliseName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findCatalogService(
  services: readonly ServiceCard[],
  hint: CatalogServiceHint,
): ServiceCard | undefined {
  const slug = hint.slug?.trim();
  if (slug) {
    const bySlug = services.find((service) => service.slug === slug);
    if (bySlug) return bySlug;
  }

  const name = hint.name ? normaliseName(hint.name) : "";
  if (name === "") return undefined;

  const matches = services.filter((service) => normaliseName(service.name) === name);
  if (matches.length === 0) return undefined;

  const categorySlug = hint.categorySlug?.trim();
  if (categorySlug) {
    const inCategory = matches.find((service) => service.category_slug === categorySlug);
    if (inCategory) return inCategory;
  }

  return matches[0];
}
