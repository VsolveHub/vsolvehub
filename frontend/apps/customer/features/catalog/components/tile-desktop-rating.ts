/**
 * Display helpers for the desktop category pane.
 *
 * This module used to also produce star ratings, review counts, booking counts and
 * an "earliest slot", hashed from the slug. The platform publishes none of those
 * (there is no review aggregate and the pane does not read capacity), so they were
 * removed rather than shown to customers as fact. Add them back only when the
 * contract carries real figures.
 */

/** "AC Services" → "AC", so the sidebar title is not "AC Services Services". */
export function categoryHeadline(name: string): string {
  const trimmed = name.replace(/\s+Services$/i, "").trim();
  return trimmed === "" ? name : trimmed;
}
