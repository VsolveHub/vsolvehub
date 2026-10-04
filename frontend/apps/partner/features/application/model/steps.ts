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
  label: string;
}

export const APPLICATION_STEPS: readonly ApplicationStep[] = [
  { href: "/apply", label: "Overview" },
  { href: "/apply/about", label: "About you" },
  { href: "/apply/work", label: "Your trades" },
  { href: "/apply/areas", label: "Where you work" },
  { href: "/apply/consent", label: "Agreements" },
  { href: "/apply/documents", label: "Documents" },
  { href: "/apply/schedule", label: "Your hours" },
  { href: "/apply/review", label: "Review and send" },
] as const;

/**
 * What the partner signed up to do, as the server records it on the application.
 *
 * `STAY_HOST` lists a property. `RENTAL_OWNER` lists items for rent. Trades,
 * service areas and working hours describe travelling to a customer, so neither
 * listing path sees those steps.
 */
export type ApplicationTrack = "SERVICES" | "STAY_HOST" | "RENTAL_OWNER";

const LISTING_STEPS = new Set(["/apply", "/apply/about", "/apply/consent", "/apply/documents", "/apply/review"]);

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
 * The specialist-work routes added by M2 (`M2-FE-103..106`, `M2-FE-109`).
 *
 * A separate list, and deliberately **not** appended to `APPLICATION_STEPS`.
 * Those eight steps are the path every applicant walks; these four are asked for
 * only when a Partner applies for workforce or project work, and putting them in
 * the main strip would show four extra tabs to the overwhelming majority of
 * Partners who will never need one. That is the up-front wall `M2-FE-105`
 * exists to remove, rebuilt as navigation.
 *
 * `ApplyShell` renders this strip only while the reader is inside it, so it
 * orients somebody who is here and stays invisible to everybody else.
 */
export const CAPABILITY_STEPS: readonly ApplicationStep[] = [
  { href: "/apply/capabilities", label: "Specialist work" },
  { href: "/apply/business", label: "How you work" },
  { href: "/apply/insurance", label: "Worker insurance" },
  { href: "/apply/demand", label: "Work near you" },
] as const;

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

/** Which specialist step a path is on, or -1. */
export function capabilityStepIndexOf(pathname: string): number {
  return CAPABILITY_STEPS.findIndex((step) => step.href === normalise(pathname));
}

/** The step after `pathname`, or null at the end of the sequence or off it. */
export function nextStep(pathname: string, track?: string | null): ApplicationStep | null {
  const index = stepIndexOf(pathname, track);
  if (index === -1) return null;
  return applicationSteps(track)[index + 1] ?? null;
}

export function isLastStep(pathname: string, track?: string | null): boolean {
  return stepIndexOf(pathname, track) === applicationSteps(track).length - 1;
}
