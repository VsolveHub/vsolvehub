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
 */
export const SCREEN_LABELS: Record<Screen, string> = {
  what: "What needs doing",
  where_when: "Where and when",
  visits_send: "Choose visits & send",
};
