// Ported from frontend/apps/partner/features/application/model/steps.ts
/**
 * The same steps, in the same order, as the website: the agreements are accepted on the last
 * screen, "Agree & send", and where a services partner works is its own step after the trades.
 */

export interface ApplicationStep {
  href: string;
  label: string;
}

/** Stays and rentals list something they own: the short form. */
export const APPLICATION_STEPS: readonly ApplicationStep[] = [
  { href: "/apply/about", label: "About you" },
  { href: "/apply/documents", label: "Documents" },
  { href: "/apply/review", label: "Agree & send" },
] as const;

/**
 * People who travel to a customer also say what they do, where and when. The server refuses a
 * services application without trades, areas and hours, so these cannot be skipped.
 */
export const SERVICE_APPLICATION_STEPS: readonly ApplicationStep[] = [
  { href: "/apply/about", label: "About you" },
  { href: "/apply/work", label: "Your work" },
  { href: "/apply/areas", label: "Where you work" },
  { href: "/apply/schedule", label: "Your hours" },
  { href: "/apply/documents", label: "Documents" },
  { href: "/apply/review", label: "Agree & send" },
] as const;

/** Tracks on the short form. Ride captains too: the server asks them no trades, areas or hours. */
export function isListingTrack(track?: string | null): boolean {
  return track === "STAY_HOST" || track === "RENTAL_OWNER" || track === "RIDE_CAPTAIN";
}

/** The step sequence for this partner. Services is the server's default track, as on the web. */
export function applicationSteps(track?: string | null): readonly ApplicationStep[] {
  return isListingTrack(track) ? APPLICATION_STEPS : SERVICE_APPLICATION_STEPS;
}

/**
 * A draft nobody has touched yet. The server creates one, on the Services track, the first time a
 * signed-in partner's application is read; every choice or edit raises the version. Until then the
 * partner has not chosen how to join, and is shown the choice.
 */
export function isUnchosenDraft(
  application: { status: string; version: number } | null | undefined,
): boolean {
  return application?.status === "DRAFT" && application.version === 1;
}

/** The four ways to join offered on the first screen. */
export type StartTrack = "SERVICES" | "STAY_HOST" | "RENTAL_OWNER" | "RIDE_CAPTAIN";

const AFTER_APPROVAL: Record<StartTrack, string> = {
  SERVICES: "After approval, job offers come to you in the V Solve Hub partner app.",
  STAY_HOST: "After approval, you add your property and rooms, and guests can book.",
  RENTAL_OWNER: "After approval, you add your items, and customers can rent them.",
  RIDE_CAPTAIN: "After approval, you go on duty and ride requests come to you.",
};

/** What the first screen shows once a way of joining is picked, before anything starts. */
export function trackPreview(track: StartTrack): {
  steps: readonly ApplicationStep[];
  time: string;
  after: string;
} {
  return {
    steps: applicationSteps(track),
    time: isListingTrack(track) ? "About 3 minutes" : "About 5 minutes",
    after: AFTER_APPROVAL[track],
  };
}

/**
 * The specialist-work routes.
 */
export const CAPABILITY_STEPS: readonly ApplicationStep[] = [
  { href: "/apply/capabilities", label: "Specialist work" },
  { href: "/apply/business", label: "How you work" },
  { href: "/apply/insurance", label: "Worker insurance" },
  { href: "/apply/demand", label: "Work near you" },
] as const;

/**
 * Which step a path is on, or -1.
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
  const steps = applicationSteps(track);
  return stepIndexOf(pathname, track) === steps.length - 1;
}
