/**
 * The two-screen requirement sequence, and why it is exactly two.
 *
 * The M2-revamp fixed a tighter flow-weight budget than revision 2 did: *What*
 * and *Where/When*, nothing else. This list is the enforceable half of that
 * budget — a closed constant with a test on its length — so a third screen has
 * to be an argument somebody makes on purpose, not a file somebody adds.
 *
 * ## What happened to `details` and `review`
 *
 * `details` ("Show us the space") collected photos, voice notes and a free-text
 * paragraph. The redesign removed all three from requirement capture: the
 * category questions collect the facts matching needs, and a vendor prices on
 * the visit, not on a photo. `review` restated an address and a date the
 * Customer had chosen one screen earlier — the same act twice. The estimate
 * count moved onto *Where/When*, and the submit guard re-asserts every earlier
 * rule, so nothing the review screen enforced was lost with it.
 *
 * ## The second screen is the confirmation
 *
 * `M2-FE-206`'s rule survives in stronger form: there is no confirm screen
 * because there is nothing to confirm that is not already on the screen the
 * Customer is looking at when they press send.
 */

export const SCREENS = ["what", "where_when"] as const;

export type Screen = (typeof SCREENS)[number];

/**
 * The flow-weight budget as a number the tests can read.
 *
 * Two, since the M2-revamp. Duplicated here rather than referenced because a
 * Markdown table cannot fail a build.
 */
export const SCREEN_BUDGET = 2;

export function screenIndex(screen: Screen): number {
  return SCREENS.indexOf(screen);
}

export function nextScreen(screen: Screen): Screen | null {
  const index = screenIndex(screen);
  if (index === -1 || index === SCREENS.length - 1) return null;
  return SCREENS[index + 1] ?? null;
}

export function previousScreen(screen: Screen): Screen | null {
  const index = screenIndex(screen);
  if (index <= 0) return null;
  return SCREENS[index - 1] ?? null;
}

export function isFinalScreen(screen: Screen): boolean {
  return screen === SCREENS[SCREENS.length - 1];
}

/**
 * Customer-facing screen labels for the progress indicator.
 *
 * Plain nouns, not our vocabulary. "What you need" rather than "Scope", because
 * the Customer is describing a problem and has not agreed to learn a word for it.
 */
export const SCREEN_LABELS: Record<Screen, string> = {
  what: "What you need",
  where_when: "Where and when",
};
