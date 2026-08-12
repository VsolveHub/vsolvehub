/**
 * The four-screen requirement sequence, and why it is exactly four.
 *
 * Revision 2 of the M2 plan fixed a flow-weight budget, and this list is the
 * enforceable half of it: *What*, *Where/When*, *Details*, *Review*. Exceeding it
 * is recorded as a design regression rather than a detail, so the sequence is a
 * closed constant with a test on its length — a fifth screen has to be an
 * argument somebody makes on purpose, not a file somebody adds.
 *
 * ## Review is the confirmation
 *
 * There is no `confirm` screen after `review`, and `M2-FE-206` is explicit that
 * one must not be added. The earlier design had the Customer approve an immutable
 * version *after* reviewing it, which is the same act twice: the second screen
 * asks "are you sure?" about a page whose entire job was to let them be sure.
 *
 * ## What is deliberately not a screen
 *
 * Callback preference, site-visit interest, access constraints and preferred
 * communication were each a step in the pre-audit design. `FLOW-02` moved them
 * to optional entry points reached *from* review. They are real options and some
 * Customers want them; none is worth a screen every Customer walks through, and
 * four of them turned a four-screen flow into an eight-screen one for the benefit
 * of a minority.
 *
 * See `OPTIONAL_DETAILS` below — they are modelled, just not sequenced.
 */

export const SCREENS = ["what", "where_when", "details", "review"] as const;

export type Screen = (typeof SCREENS)[number];

/**
 * The flow-weight budget as a number the tests can read.
 *
 * `03-frontend-tasks.md` fixes it at four. Duplicated here rather than referenced
 * because a Markdown table cannot fail a build.
 */
export const SCREEN_BUDGET = 4;

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
  details: "Details",
  review: "Review",
};

/**
 * The optional extras, reachable from review and never sequenced.
 *
 * `FLOW-02`. Modelled as data so the review screen can render them in one place
 * and so adding one cannot accidentally become adding a step.
 */
export const OPTIONAL_DETAILS = [
  "callback_preference",
  "site_visit_interest",
  "access_constraints",
  "preferred_communication",
] as const;

export type OptionalDetail = (typeof OPTIONAL_DETAILS)[number];

export const OPTIONAL_DETAIL_LABELS: Record<OptionalDetail, string> = {
  callback_preference: "Ask us to call you",
  site_visit_interest: "Request a site visit",
  access_constraints: "Access instructions",
  preferred_communication: "How to reach you",
};
