/**
 * Groups the core property-trade categories (`technician`, `electrician`,
 * `plumber`) into one "Technician, Electrician & Plumber" tile on the home screen.
 * Mirrors `frontend/apps/customer/features/catalog/home-category-groups.ts`.
 */

import type { Category } from "./client-queries";

export const HOME_REPAIR_SLUGS = ["technician", "electrician", "plumber"] as const;

export const HOME_REPAIR_GROUP = {
  id: "repairs-maintenance",
  slug: "repairs-maintenance",
  title: "Technician, Electrician & Plumber",
  modalDescription: "Choose the specialist you need.",
} as const;

export type HomeItem =
  | { kind: "category"; category: Category }
  | { kind: "group"; members: Category[] };

/**
 * Splits published categories into standalone tiles and the unified
 * Repairs & Maintenance group. Only collapses when at least two trade
 * members are published; positions the group at the first member's slot.
 */
export function groupHomeRepairs(categories: readonly Category[]): HomeItem[] {
  const members = categories.filter((c) =>
    (HOME_REPAIR_SLUGS as readonly string[]).includes(c.slug),
  );
  if (members.length < 2) {
    return categories.map((category) => ({ kind: "category" as const, category }));
  }

  const items: HomeItem[] = [];
  for (const category of categories) {
    if (category === members[0]) {
      items.push({ kind: "group", members });
    } else if (!members.includes(category)) {
      items.push({ kind: "category", category });
    }
  }
  return items;
}
