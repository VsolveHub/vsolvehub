import type { ServiceCard } from "./client-queries";

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
