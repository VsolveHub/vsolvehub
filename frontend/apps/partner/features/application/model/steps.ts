/**
 * The onboarding step sequence.
 *
 * One list, imported by both the shell's navigation and the editor's
 * "Save and continue". They were previously separate concerns — the nav had the
 * order and the editor had none — which is exactly how a button labelled
 * "continue" ended up not continuing: nothing in the editor knew what came next,
 * so it silently did half of what it said.
 *
 * Keeping the order here also means adding or reordering a step is one edit
 * rather than two that can disagree.
 */

export interface ApplicationStep {
  href: string;
  /** A catalogue key (`@vsolve/ui` `useT`), not the label itself — resolve with `t(labelKey)`. */
  labelKey: string;
}

export const APPLICATION_STEPS: readonly ApplicationStep[] = [
  { href: "/apply", labelKey: "apply.steps.overview" },
  { href: "/apply/about", labelKey: "apply.steps.about" },
  // Trades, job types and service areas on one screen: the server validates them together.
  { href: "/apply/work", labelKey: "apply.steps.work" },
  { href: "/apply/schedule", labelKey: "apply.steps.schedule" },
  { href: "/apply/documents", labelKey: "apply.steps.documents" },
  // The agreements are accepted on the screen that sends the application.
  { href: "/apply/review", labelKey: "apply.steps.review" },
] as const;

/**
 * What the partner signed up to do, as the server records it on the application.
 *
 * `STAY_HOST` lists a property. `RENTAL_OWNER` lists items for rent. Trades,
 * service areas and working hours describe travelling to a customer, so neither
 * listing path sees those steps.
 */
export type ApplicationTrack = "SERVICES" | "STAY_HOST" | "RENTAL_OWNER";

const LISTING_STEPS = new Set(["/apply", "/apply/about", "/apply/documents", "/apply/review"]);

/** Stays and rentals share the short application. Services walk the full list. */
export function isListingTrack(track?: string | null): boolean {
  return track === "STAY_HOST" || track === "RENTAL_OWNER";
}

/** The step sequence for this partner. Every caller goes through here, never the constant. */
export function applicationSteps(track?: string | null): readonly ApplicationStep[] {
  return isListingTrack(track)
    ? APPLICATION_STEPS.filter((step) => LISTING_STEPS.has(step.href))
    : APPLICATION_STEPS;
}

/**
 * Which step a path is on, or -1.
 *
 * Compared exactly rather than by prefix: `/apply` is a prefix of every other
 * step, so a `startsWith` check would report the overview for all of them. A
 * trailing slash is tolerated because Next can produce either form.
 */
export function stepIndexOf(pathname: string, track?: string | null): number {
  return applicationSteps(track).findIndex((step) => step.href === normalise(pathname));
}

function normalise(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/** The step after `pathname`, or null at the end of the sequence or off it. */
export function nextStep(pathname: string, track?: string | null): ApplicationStep | null {
  const index = stepIndexOf(pathname, track);
  if (index === -1) return null;
  return applicationSteps(track)[index + 1] ?? null;
}
