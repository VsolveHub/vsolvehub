/**
 * The three-screen requirement sequence:
 * Step 1 of 3 — What needs doing?
 * Step 2 of 3 — Where and when?
 * Step 3 of 3 — Choose visits & send
 *
 * ## The three steps
 *
 * `what` collects category facts (choices, numbers, booleans) with zero typing.
 * `where_when` collects site address and date information only.
 * `visits_send` contains compact fact recaps, the 1/2/3 estimate chooser, visit
 * slot selections, and the single Send action.
 */

export const SCREENS = ["what", "where_when", "visits_send"] as const;

export type Screen = (typeof SCREENS)[number];

/**
 * The flow-weight budget as a number the tests can read.
 *
 * Three steps.
 */
export const SCREEN_BUDGET = 3;

/**
 * Every navigation helper takes the *active* sequence as an optional second
 * argument and defaults to the full budget. A variant that publishes no
 * questions walks `["where_when", "visits_send"]` — see `active-screens.ts` —
 * and the reducer must step through that list, not this one, or Continue
 * from "Where and when" would land on a step the Customer never saw.
 */
export function screenIndex(screen: Screen, screens: readonly Screen[] = SCREENS): number {
  return screens.indexOf(screen);
}

export function nextScreen(screen: Screen, screens: readonly Screen[] = SCREENS): Screen | null {
  const index = screenIndex(screen, screens);
  if (index === -1 || index === screens.length - 1) return null;
  return screens[index + 1] ?? null;
}

export function previousScreen(
  screen: Screen,
  screens: readonly Screen[] = SCREENS,
): Screen | null {
  const index = screenIndex(screen, screens);
  if (index <= 0) return null;
  return screens[index - 1] ?? null;
}

export function isFinalScreen(screen: Screen, screens: readonly Screen[] = SCREENS): boolean {
  return screen === screens[screens.length - 1];
}

/**
 * Customer-facing screen labels for the progress indicator.
 */
export const SCREEN_LABELS: Record<Screen, string> = {
  what: "What needs doing",
  where_when: "Where and when",
  visits_send: "Choose visits & send",
};
