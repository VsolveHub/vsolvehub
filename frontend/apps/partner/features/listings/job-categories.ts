/** The category of household roles: what someone hiring for themselves or their home usually wants. */
export const HOME_CATEGORY = "Home & Personal";

/** What the first step of the job form shows, and in which order. */
export interface JobCategoryLayout<Category> {
  /**
   * The household category, whose roles an individual sees straight away as tiles. Null for a
   * business, before the employer has chosen who is hiring, and when the server offers no
   * household roles: those employers see the category grid as before.
   */
  home: Category | null;
  /**
   * The category grid. For an individual, every category but the household one, shown when they
   * ask for it ("Hiring for something else?"). For everyone else, every category in the server's
   * order.
   */
  others: Category[];
}

/**
 * How the job categories are laid out for this employer.
 *
 * Someone hiring for themselves or their home thinks "I need a cook", not "which industry is
 * this?", so they are shown the household roles first. Nothing is taken away: every other
 * category stays one tap away, and the server, not this layout, decides what may be posted.
 */
export function jobCategoryLayout<Category extends { name: string; roles: readonly unknown[] }>(
  categories: readonly Category[],
  hiringAs: string | null | undefined,
): JobCategoryLayout<Category> {
  const home =
    hiringAs === "INDIVIDUAL"
      ? (categories.find((category) => category.name === HOME_CATEGORY && category.roles.length > 0) ??
        null)
      : null;
  return { home, others: categories.filter((category) => category !== home) };
}

/**
 * Search matches in the order to show them. For an individual, household roles come first, so
 * "driver" finds the family driver before the heavy-vehicle driver. Nothing is dropped.
 */
export function rankRoleMatches<Match extends { category: string }>(
  matches: readonly Match[],
  hiringAs: string | null | undefined,
): Match[] {
  if (hiringAs !== "INDIVIDUAL") return [...matches];
  return [
    ...matches.filter((match) => match.category === HOME_CATEGORY),
    ...matches.filter((match) => match.category !== HOME_CATEGORY),
  ];
}
