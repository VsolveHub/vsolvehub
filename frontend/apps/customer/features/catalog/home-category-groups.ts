/**
 * Groups the core property-trade categories (`technician`, `electrician`,
 * `plumber`) into one "Technician, Electrician & Plumber" tile on the home screen.
 *
 * Lives in a plain module (no `"use client"`) so Server Components such as
 * `HomePage` and `CategoryGrid` can group categories before passing them to
 * client UI components without triggering Next.js's server-to-client call error.
 */

export interface HomeCategorySubcategory {
  id?: string | number;
  slug: string;
  name: string;
  service_count?: number;
}

export interface HomeCategorySummary {
  id: string | number;
  slug: string;
  name: string;
  description?: string;
  icon_key?: string;
  image_url: string;
  subcategories?: readonly HomeCategorySubcategory[];
}

/** Trade categories consolidated under the single grouped tile. */
export const HOME_REPAIR_SLUGS = ["technician", "electrician", "plumber"] as const;

export const HOME_REPAIR_GROUP = {
  id: "repairs-maintenance",
  slug: "repairs-maintenance",
  title: "Technician, Electrician & Plumber",
  modalDescription: "Choose the specialist you need.",
  imageUrl: "/catalog/tiles/repairs-maintenance.jpg",
} as const;

export type HomeItem<T extends HomeCategorySummary> =
  | { kind: "category"; category: T }
  | { kind: "group"; members: T[] };

/**
 * Splits published categories into standalone tiles and the unified
 * Repairs & Maintenance group. The group only forms when at least two trade
 * members are published; its grid position matches the first published member.
 */
export function groupHomeRepairs<T extends HomeCategorySummary>(
  categories: readonly T[],
): HomeItem<T>[] {
  const members = categories.filter((c) =>
    (HOME_REPAIR_SLUGS as readonly string[]).includes(c.slug),
  );
  if (members.length < 2) {
    return categories.map((category) => ({ kind: "category" as const, category }));
  }

  const items: HomeItem<T>[] = [];
  for (const category of categories) {
    if (category === members[0]) {
      items.push({ kind: "group", members });
    } else if (!members.includes(category)) {
      items.push({ kind: "category", category });
    }
  }
  return items;
}
