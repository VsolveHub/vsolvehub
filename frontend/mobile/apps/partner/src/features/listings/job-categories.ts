// Ported from frontend/apps/partner/features/listings/job-categories.ts
/** The category every employer sees, and an individual sees first: help for a home. */
export const HOME_CATEGORY = "Home & Personal";

/**
 * The job categories in the order to show them.
 *
 * Someone hiring for themselves or their home is most likely to want household help, so that
 * category comes first for them. Only the order changes: every category stays available to every
 * employer, and everyone else keeps the server's order.
 */
export function orderJobCategories<Category extends { name: string }>(
  categories: readonly Category[],
  hiringAs: string | null | undefined,
): Category[] {
  if (hiringAs !== "INDIVIDUAL") return [...categories];
  const home = categories.filter((category) => category.name === HOME_CATEGORY);
  const rest = categories.filter((category) => category.name !== HOME_CATEGORY);
  return [...home, ...rest];
}
