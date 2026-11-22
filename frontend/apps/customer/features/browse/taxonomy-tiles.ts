import type { Category } from "@/features/catalog/client-queries";

export interface TaxonomyServiceItem {
  id: string;
  name: string;
  slug: string;
}

export interface TaxonomySubcategoryInput {
  id: string | number;
  name: string;
  slug: string;
  services?: TaxonomyServiceItem[];
}

export interface BrowseTile {
  slug: string;
  name: string;
  description: string;
  iconKey: string;
  imageUrl: string;
  services: TaxonomyServiceItem[];
}

export const ALL_TILE_SLUG = "all";

/**
 * Builds left-sidebar tiles for Rentals / Stays by merging the live taxonomy
 * (which supplies child services) with the public catalog category (which owns
 * each subcategory's 3D tile artwork and description).
 */
export function buildBrowseTiles({
  taxonomy,
  category,
  allLabel,
  allDescription,
  fallbackIconKey = "service",
}: {
  taxonomy: readonly TaxonomySubcategoryInput[];
  category?: Category;
  allLabel: string;
  allDescription: string;
  fallbackIconKey?: string;
}): BrowseTile[] {
  const catalogSubBySlug = new Map(
    (category?.subcategories ?? []).map((sub) => [sub.slug, sub]),
  );

  const allTile: BrowseTile = {
    slug: ALL_TILE_SLUG,
    name: allLabel,
    description: allDescription,
    iconKey: category?.icon_key || fallbackIconKey,
    imageUrl: category?.image_url || "",
    services: [],
  };

  const mapped: BrowseTile[] = taxonomy.map((sub) => {
    const catalogSub = catalogSubBySlug.get(sub.slug);
    return {
      slug: sub.slug,
      name: sub.name,
      description: catalogSub?.description ?? "",
      iconKey: catalogSub?.icon_key || fallbackIconKey,
      imageUrl: catalogSub?.image_url || "",
      services: (sub.services ?? []).map((svc) => ({
        id: String(svc.id),
        name: svc.name,
        slug: svc.slug,
      })),
    };
  });

  // If taxonomy hasn't loaded yet but catalog category is cached, fall back to
  // catalog subcategories so tiles appear without layout shift.
  if (mapped.length === 0 && category?.subcategories?.length) {
    for (const sub of category.subcategories) {
      mapped.push({
        slug: sub.slug,
        name: sub.name,
        description: sub.description ?? "",
        iconKey: sub.icon_key || fallbackIconKey,
        imageUrl: sub.image_url || "",
        services: [],
      });
    }
  }

  return [allTile, ...mapped];
}

