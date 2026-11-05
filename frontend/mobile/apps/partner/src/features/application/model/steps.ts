// Ported from frontend/apps/partner/features/application/model/steps.ts
/**
 * The 4-step mobile onboarding sequence matching the VSolve Hub partner mobile app design.
 *
 * Step 1: About you (/apply/about)
 * Step 2: Agreements (/apply/consent)
 * Step 3: Documents (/apply/documents)
 * Step 4: Review and send (/apply/review)
 */

export interface ApplicationStep {
  href: string;
  label: string;
}

export const APPLICATION_STEPS: readonly ApplicationStep[] = [
  { href: "/apply/about", label: "About you" },
  { href: "/apply/consent", label: "Agreements" },
  { href: "/apply/documents", label: "Documents" },
  { href: "/apply/review", label: "Review and send" },
] as const;

/**
 * People who travel to a customer also say what they do, where and when. The server refuses a
 * services application without trades and areas, so these cannot be skipped. Stays and rentals list
 * something they own, and keep the short list above.
 */
export const SERVICE_APPLICATION_STEPS: readonly ApplicationStep[] = [
  { href: "/apply/about", label: "About you" },
  { href: "/apply/work", label: "Your work" },
  { href: "/apply/schedule", label: "Working hours" },
  { href: "/apply/consent", label: "Agreements" },
  { href: "/apply/documents", label: "Documents" },
  { href: "/apply/review", label: "Review and send" },
] as const;

/** The step sequence for this partner. Every caller goes through here, as on the web. */
export function applicationSteps(track?: string | null): readonly ApplicationStep[] {
  return track === "SERVICES" ? SERVICE_APPLICATION_STEPS : APPLICATION_STEPS;
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
