import { isListingTrack } from "@vsolve/query/native";
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

/** Ride captains add their vehicle before agreeing: it locks once the application is sent. */
export const CAPTAIN_APPLICATION_STEPS: readonly ApplicationStep[] = [
  { href: "/apply/about", label: "About you" },
  { href: "/apply/documents", label: "Documents" },
  { href: "/rides/vehicle", label: "Your vehicle" },
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

/** Who an employer hires for. Empty until they choose. */
export type HiringAs = "INDIVIDUAL" | "BUSINESS";

const HIRING_AS: ApplicationStep = { href: "/apply/hiring-as", label: "Who is hiring" };
const DOCUMENTS: ApplicationStep = { href: "/apply/documents", label: "Documents" };
const REVIEW: ApplicationStep = { href: "/apply/review", label: "Agree & send" };

/**
 * An employer first says who is hiring, and what they are asked next follows from it. Each is its
 * own list, so `APPLICATION_STEPS` stays exactly the short path. Before a choice, only the choice
 * shows: what comes after depends on it. The same lists as the website's, without its overview.
 */
const EMPLOYER_UNCHOSEN_STEPS: readonly ApplicationStep[] = [HIRING_AS];
const EMPLOYER_INDIVIDUAL_STEPS: readonly ApplicationStep[] = [
  HIRING_AS,
  { href: "/apply/employer/about", label: "About you" },
  DOCUMENTS,
  REVIEW,
];
const EMPLOYER_BUSINESS_STEPS: readonly ApplicationStep[] = [
  HIRING_AS,
  { href: "/apply/employer/business", label: "Business details" },
  { href: "/apply/employer/contact", label: "You and your role" },
  DOCUMENTS,
  REVIEW,
];

/** Stays, rentals, hiring and ride captains share the short application. Services walk the full list. */
export { isListingTrack };

/** The step sequence for this partner. Services is the server's default track, as on the web. */
export function applicationSteps(
  track?: string | null,
  hiringAs?: string | null,
): readonly ApplicationStep[] {
  if (track === "EMPLOYER") {
    if (hiringAs === "INDIVIDUAL") return EMPLOYER_INDIVIDUAL_STEPS;
    if (hiringAs === "BUSINESS") return EMPLOYER_BUSINESS_STEPS;
    return EMPLOYER_UNCHOSEN_STEPS;
  }
  if (track === "RIDE_CAPTAIN") return CAPTAIN_APPLICATION_STEPS;
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

/**
 * Where a partner goes first once they have chosen how to join. An employer starts by saying who
 * is hiring; everyone else starts with who they are.
 */
export function firstStepHref(track: string): string {
  return track === "EMPLOYER" ? "/apply/hiring-as" : "/apply/about";
}

/** The ways to join offered on the first screen. */
export type StartTrack = "SERVICES" | "STAY_HOST" | "RENTAL_OWNER" | "EMPLOYER" | "RIDE_CAPTAIN";

/**
 * Whether this device offers a way of joining. Captains are Android only in V1 (Rides brief,
 * Revision 2), so iOS never shows the rides track; every other track shows everywhere.
 */
export function isTrackOffered(track: StartTrack, os: string): boolean {
  return track !== "RIDE_CAPTAIN" || os !== "ios";
}

const AFTER_APPROVAL: Record<StartTrack, string> = {
  SERVICES: "After approval, job offers come to you in the V Solve Hub partner app.",
  STAY_HOST: "After approval, you add your property and rooms, and guests can book.",
  RENTAL_OWNER: "After approval, you add your items, and customers can rent them.",
  EMPLOYER: "After approval, you post your jobs and people can apply.",
  RIDE_CAPTAIN: "After approval, you go on duty and ride requests come to you.",
};

/** What the first screen shows once a way of joining is picked, before anything starts. */
export function trackPreview(track: StartTrack): {
  steps: readonly ApplicationStep[];
  time: string;
  after: string;
} {
  return {
    steps:
      track === "EMPLOYER"
        ? // Who is hiring comes first and decides the rest, so the preview names the one
          // "your details" stage that follows rather than either path.
          [HIRING_AS, { href: "/apply/employer", label: "Your details" }, DOCUMENTS, REVIEW]
        : applicationSteps(track),
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
export function stepIndexOf(
  pathname: string,
  track?: string | null,
  hiringAs?: string | null,
): number {
  return applicationSteps(track, hiringAs).findIndex((step) => step.href === normalise(pathname));
}

function normalise(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/** Which specialist step a path is on, or -1. */
export function capabilityStepIndexOf(pathname: string): number {
  return CAPABILITY_STEPS.findIndex((step) => step.href === normalise(pathname));
}

/** The step after `pathname`, or null at the end of the sequence or off it. */
export function nextStep(
  pathname: string,
  track?: string | null,
  hiringAs?: string | null,
): ApplicationStep | null {
  const index = stepIndexOf(pathname, track, hiringAs);
  if (index === -1) return null;
  return applicationSteps(track, hiringAs)[index + 1] ?? null;
}

export function isLastStep(
  pathname: string,
  track?: string | null,
  hiringAs?: string | null,
): boolean {
  const steps = applicationSteps(track, hiringAs);
  return stepIndexOf(pathname, track, hiringAs) === steps.length - 1;
}
