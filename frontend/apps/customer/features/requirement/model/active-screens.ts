import { SCREENS, type Screen } from "./screens";

/**
 * Which of the budgeted screens a given variant actually walks.
 *
 * Quote-based (A5) projects are visit-first: the professional visits, measures
 * and quotes, so the brief asks for nothing the visit will answer. A variant
 * that publishes **no** questions has nothing for step 1 to show, and a step
 * with nothing on it is not a step — the flow starts on "Where and when", the
 * wizard counts "1 of 2", and Back from there leaves the flow.
 *
 * Same idea as `eventBriefShape`: the shape is read off the catalogue's
 * questions, never off a slug, so a second question-free variant gets the same
 * treatment without a deploy.
 *
 * `SCREENS` itself is untouched — the budget stays three, and a variant that
 * does publish questions still walks all three.
 */
export function activeScreens(questions: readonly unknown[]): readonly Screen[] {
  return questions.length === 0 ? SCREENS.filter((screen) => screen !== "what") : SCREENS;
}

/** The 1-based position of `screen` in the active sequence, for "Step N of M". */
export function stepNumber(screens: readonly Screen[], screen: Screen): number {
  const index = screens.indexOf(screen);
  return index === -1 ? 1 : index + 1;
}

/** Where the flow opens. `SCREENS` is never empty, so neither is any active list. */
export function firstScreen(screens: readonly Screen[]): Screen {
  return screens[0] ?? SCREENS[0];
}
